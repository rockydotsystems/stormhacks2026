import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  changeIdSchema,
  docMetadataSchema,
  snapshotSchema,
  type DocChange,
  type DocVersion,
  type Snapshot,
} from "./contracts";
import { docChanges, docs, docVersions } from "./schema";
import type { OrganizationActor } from "../organizations/contracts";
import { requireOrganizationMember } from "../organizations/membership";
import { requireProject } from "../projects/access";
import type { Database, Page } from "../db";
import { ApiError } from "../errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function versionDto(row: typeof docVersions.$inferSelect): DocVersion {
  return {
    ...row,
    changeId: row.changeId.toString(),
    label: `v${row.number}`,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export class DocsService {
  constructor(private readonly dependencies: { db: Database }) {}

  private async requireDoc(
    db: Database | Transaction,
    actor: OrganizationActor,
    docId: string,
    lock = false,
  ) {
    await requireOrganizationMember(db, actor);
    const query = db
      .select()
      .from(docs)
      .where(
        and(
          eq(docs.id, docId),
          eq(docs.organizationId, actor.organizationId),
          isNull(docs.deletedAt),
        ),
      );
    const [doc] = await (lock ? query.for("update") : query);
    if (!doc) throw new ApiError(404, "Doc not found.");
    return doc;
  }

  async create(
    actor: OrganizationActor,
    projectId: string,
    input: Snapshot & { description?: string },
  ) {
    const snapshot = snapshotSchema.parse(input);
    return this.dependencies.db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, true);
      const [doc] = await tx
        .insert(docs)
        .values({
          organizationId: actor.organizationId,
          projectId,
          description: input.description || "",
        })
        .returning();
      await tx
        .insert(docChanges)
        .values({ docId: doc.id, ...snapshot, createdBy: actor.userId });
      return {
        id: doc.id,
        organizationId: doc.organizationId,
        projectId: doc.projectId,
        description: doc.description,
        createdAt: doc.createdAt.toISOString(),
      };
    });
  }

  async list(actor: OrganizationActor, projectId: string, page?: Page) {
    await requireProject(this.dependencies.db, actor, projectId);
    const query = this.dependencies.db
      .select()
      .from(docs)
      .where(
        and(
          eq(docs.organizationId, actor.organizationId),
          eq(docs.projectId, projectId),
          isNull(docs.deletedAt),
        ),
      )
      .orderBy(asc(docs.createdAt), asc(docs.id));
    const rows = await (page
      ? query.limit(page.limit).offset(page.offset)
      : query);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addChange(actor: OrganizationActor, docId: string, input: Snapshot) {
    return this.appendChange(actor, docId, input, false);
  }

  async proposeChange(
    actor: OrganizationActor,
    docId: string,
    input: Snapshot,
  ) {
    return this.appendChange(actor, docId, input, true);
  }

  private async appendChange(
    actor: OrganizationActor,
    docId: string,
    input: Snapshot,
    proposed: boolean,
  ) {
    const snapshot = snapshotSchema.parse(input);
    return this.dependencies.db.transaction(async (tx) => {
      await this.requireDoc(tx, actor, docId, true);
      const [row] = await tx
        .insert(docChanges)
        .values({ docId, ...snapshot, proposed, createdBy: actor.userId })
        .returning();
      return {
        ...row,
        id: row.id.toString(),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async listChanges(
    actor: OrganizationActor,
    docId: string,
  ): Promise<DocChange[]> {
    await this.requireDoc(this.dependencies.db, actor, docId);
    // One statement observes both history and its published boundary consistently.
    const rows = await this.dependencies.db
      .select({
        ...this.changeSummaryFields(),
        content: docChanges.content,
      })
      .from(docChanges)
      .where(eq(docChanges.docId, docId))
      .orderBy(asc(docChanges.id));
    return rows.map((row) => ({
      ...row,
      id: row.id.toString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private changeSummaryFields() {
    return {
      id: docChanges.id,
      docId: docChanges.docId,
      title: docChanges.title,
      proposed: docChanges.proposed,
      createdBy: docChanges.createdBy,
      createdAt: docChanges.createdAt,
      number: sql<number>`row_number() over (order by ${docChanges.id})`
        .mapWith(Number)
        .as("number"),
      immutable:
        sql<boolean>`${docChanges.id} <= coalesce((select max(change_id) from doc_versions where doc_id = doc_changes.doc_id), 0)`.as(
          "immutable",
        ),
    };
  }

  private changeSummaryQuery(docId: string) {
    return this.dependencies.db
      .select(this.changeSummaryFields())
      .from(docChanges)
      .where(eq(docChanges.docId, docId));
  }

  async listChangeSummaries(
    actor: OrganizationActor,
    docId: string,
    page?: Page,
  ) {
    await this.requireDoc(this.dependencies.db, actor, docId);
    const query = this.changeSummaryQuery(docId).orderBy(asc(docChanges.id));
    const rows = await (page
      ? query.limit(page.limit).offset(page.offset)
      : query);
    return rows.map((row) => ({
      ...row,
      id: row.id.toString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getChange(actor: OrganizationActor, docId: string, changeId: string) {
    const id = BigInt(changeIdSchema.parse(changeId));
    await this.requireDoc(this.dependencies.db, actor, docId);
    const history = this.changeSummaryQuery(docId).as("history");
    const [row] = await this.dependencies.db
      .select({
        id: history.id,
        docId: history.docId,
        title: history.title,
        proposed: history.proposed,
        createdBy: history.createdBy,
        createdAt: history.createdAt,
        number: history.number,
        immutable: history.immutable,
        content: docChanges.content,
      })
      .from(history)
      .innerJoin(docChanges, eq(docChanges.id, history.id))
      .where(eq(history.id, id));
    if (!row) throw new ApiError(404, "Change not found.");
    return {
      ...row,
      id: row.id.toString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getMetadata(actor: OrganizationActor, docId: string) {
    await requireOrganizationMember(this.dependencies.db, actor);
    // Correlated summaries share one statement's snapshot; no content bodies loaded.
    const [row] = await this.dependencies.db
      .select({
        id: docs.id,
        organizationId: docs.organizationId,
        projectId: docs.projectId,
        createdAt: docs.createdAt,
        latestTitle: sql<
          string | null
        >`coalesce(docs.title, (select title from doc_changes where doc_id = docs.id order by id desc limit 1))`,
        latestChangeId: sql<
          string | null
        >`(select id::text from doc_changes where doc_id = docs.id order by id desc limit 1)`,
        lastChangedAt: sql<
          string | null
        >`(select created_at::text from doc_changes where doc_id = docs.id order by id desc limit 1)`,
        changeCount:
          sql<number>`(select count(*) from doc_changes where doc_id = docs.id)`.mapWith(
            Number,
          ),
        versionCount:
          sql<number>`(select count(*) from doc_versions where doc_id = docs.id)`.mapWith(
            Number,
          ),
        latestVersionNumber: sql<
          number | null
        >`(select max(number) from doc_versions where doc_id = docs.id)`,
        hasUnpublishedChanges: sql<boolean>`exists(select 1 from doc_changes where doc_id = docs.id and id > coalesce((select max(change_id) from doc_versions where doc_id = docs.id), 0))`,
      })
      .from(docs)
      .where(
        and(
          eq(docs.id, docId),
          eq(docs.organizationId, actor.organizationId),
          isNull(docs.deletedAt),
        ),
      );
    if (!row) throw new ApiError(404, "Doc not found.");
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastChangedAt: row.lastChangedAt
        ? new Date(row.lastChangedAt).toISOString()
        : null,
      latestVersion:
        row.latestVersionNumber === null ? null : `v${row.latestVersionNumber}`,
    };
  }

  /** Display title: an explicit rename wins over the latest snapshot title. */
  private async displayTitle(
    db: Database | Transaction,
    doc: typeof docs.$inferSelect,
  ) {
    if (doc.title) return doc.title;
    const [latest] = await db
      .select({ title: docChanges.title })
      .from(docChanges)
      .where(eq(docChanges.docId, doc.id))
      .orderBy(desc(docChanges.id))
      .limit(1);
    return latest?.title ?? "Untitled document";
  }

  async updateMetadata(
    actor: OrganizationActor,
    docId: string,
    input: { title?: string; description?: string },
  ) {
    const changes = docMetadataSchema.parse(input);
    return this.dependencies.db.transaction(async (tx) => {
      await this.requireDoc(tx, actor, docId, true);
      const [row] = await tx
        .update(docs)
        .set(changes)
        .where(eq(docs.id, docId))
        .returning();
      return {
        id: row.id,
        title: await this.displayTitle(tx, row),
        description: row.description,
      };
    });
  }

  /** Soft delete: hides the doc and keeps every snapshot and version. */
  async deleteDoc(
    actor: OrganizationActor,
    docId: string,
    confirmTitle: string,
  ) {
    return this.dependencies.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, actor, docId, true);
      if (confirmTitle.trim() !== (await this.displayTitle(tx, doc)))
        throw new ApiError(400, "Type the document name to confirm.");
      await tx
        .update(docs)
        .set({ deletedAt: sql`now()` })
        .where(eq(docs.id, docId));
      return { id: docId };
    });
  }

  async deleteChange(
    actor: OrganizationActor,
    docId: string,
    changeId: string,
  ) {
    const id = BigInt(changeIdSchema.parse(changeId));
    return this.dependencies.db.transaction(async (tx) => {
      await this.requireDoc(tx, actor, docId, true);
      const [change] = await tx
        .select()
        .from(docChanges)
        .where(and(eq(docChanges.docId, docId), eq(docChanges.id, id)));
      if (!change) throw new ApiError(404, "Change not found.");
      const [latest] = await tx
        .select()
        .from(docVersions)
        .where(eq(docVersions.docId, docId))
        .orderBy(desc(docVersions.number))
        .limit(1);
      if (latest && id <= latest.changeId)
        throw new ApiError(409, "Published history cannot be deleted.");
      await tx.delete(docChanges).where(eq(docChanges.id, id));
    });
  }

  async publish(
    actor: OrganizationActor,
    docId: string,
    changeId: string,
  ): Promise<DocVersion> {
    const id = BigInt(changeIdSchema.parse(changeId));
    return this.dependencies.db.transaction(async (tx) => {
      await this.requireDoc(tx, actor, docId, true);
      const [change] = await tx
        .select()
        .from(docChanges)
        .where(and(eq(docChanges.docId, docId), eq(docChanges.id, id)));
      if (!change) throw new ApiError(404, "Change not found.");
      const [latest] = await tx
        .select()
        .from(docVersions)
        .where(eq(docVersions.docId, docId))
        .orderBy(desc(docVersions.number))
        .limit(1);
      if (latest && id <= latest.changeId)
        throw new ApiError(409, "Publish a change after the latest version.");
      const [version] = await tx
        .insert(docVersions)
        .values({ docId, changeId: id, publishedBy: actor.userId })
        .returning();
      return versionDto(version);
    });
  }

  async listVersions(
    actor: OrganizationActor,
    docId: string,
    page?: Page,
  ): Promise<DocVersion[]> {
    await this.requireDoc(this.dependencies.db, actor, docId);
    const query = this.dependencies.db
      .select()
      .from(docVersions)
      .where(eq(docVersions.docId, docId))
      .orderBy(asc(docVersions.number));
    const rows = await (page
      ? query.limit(page.limit).offset(page.offset)
      : query);
    return rows.map(versionDto);
  }

  async getVersion(actor: OrganizationActor, docId: string, number: number) {
    await this.requireDoc(this.dependencies.db, actor, docId);
    const [row] = await this.dependencies.db
      .select({ version: docVersions, change: docChanges })
      .from(docVersions)
      .innerJoin(docChanges, eq(docChanges.id, docVersions.changeId))
      .where(and(eq(docVersions.docId, docId), eq(docVersions.number, number)));
    if (!row) throw new ApiError(404, "Version not found.");
    return {
      ...versionDto(row.version),
      title: row.change.title,
      content: row.change.content,
    };
  }
}
