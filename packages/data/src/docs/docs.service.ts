import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  changeIdSchema,
  snapshotSchema,
  type DocChange,
  type DocVersion,
  type Snapshot,
} from "./contracts";
import { docChanges, docs, docVersions } from "./schema";
import type { OrganizationActor } from "../organizations/contracts";
import { requireOrganizationMember } from "../organizations/membership";
import { requireProject } from "../projects/access";
import type { Database } from "../db";
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
        and(eq(docs.id, docId), eq(docs.organizationId, actor.organizationId)),
      );
    const [doc] = await (lock ? query.for("update") : query);
    if (!doc) throw new ApiError(404, "Doc not found.");
    return doc;
  }

  async create(actor: OrganizationActor, projectId: string, input: Snapshot) {
    const snapshot = snapshotSchema.parse(input);
    return this.dependencies.db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, true);
      const [doc] = await tx
        .insert(docs)
        .values({ organizationId: actor.organizationId, projectId })
        .returning();
      await tx
        .insert(docChanges)
        .values({ docId: doc.id, ...snapshot, createdBy: actor.userId });
      return { ...doc, createdAt: doc.createdAt.toISOString() };
    });
  }

  async list(actor: OrganizationActor, projectId: string) {
    await requireProject(this.dependencies.db, actor, projectId);
    const rows = await this.dependencies.db
      .select()
      .from(docs)
      .where(
        and(
          eq(docs.organizationId, actor.organizationId),
          eq(docs.projectId, projectId),
        ),
      )
      .orderBy(asc(docs.createdAt), asc(docs.id));
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addChange(actor: OrganizationActor, docId: string, input: Snapshot) {
    const snapshot = snapshotSchema.parse(input);
    return this.dependencies.db.transaction(async (tx) => {
      await this.requireDoc(tx, actor, docId, true);
      const [row] = await tx
        .insert(docChanges)
        .values({ docId, ...snapshot, createdBy: actor.userId })
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
        id: docChanges.id,
        docId: docChanges.docId,
        title: docChanges.title,
        content: docChanges.content,
        createdBy: docChanges.createdBy,
        createdAt: docChanges.createdAt,
        number:
          sql<number>`row_number() over (order by ${docChanges.id})`.mapWith(
            Number,
          ),
        immutable: sql<boolean>`${docChanges.id} <= coalesce((select max(change_id) from doc_versions where doc_id = ${docChanges.docId}), 0)`,
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
  ): Promise<DocVersion[]> {
    await this.requireDoc(this.dependencies.db, actor, docId);
    const rows = await this.dependencies.db
      .select()
      .from(docVersions)
      .where(eq(docVersions.docId, docId))
      .orderBy(asc(docVersions.number));
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
