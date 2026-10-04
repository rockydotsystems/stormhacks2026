import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { OrganizationActor } from "@stormhacks/data";
import {
  isOrganizationAdmin,
  requireOrganizationAdmin,
  requireOrganizationMember,
} from "@stormhacks/data/organizations/membership";
import { docVersions } from "@stormhacks/data/docs/schema";
import {
  linearConnections,
  linearDocLinks,
  linearIssueLinks,
  linearProjectLinks,
  linearSyncs,
} from "@stormhacks/data/linear/schema";
import type { SyncPlan } from "@stormhacks/data/linear/contracts";
import { appOrigin } from "@/features/github/server/config";
import type { Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";
import type {
  DocumentLinearData,
  LinearConnectionData,
  LinearSyncItem,
  LinearSyncResult,
  LinearSyncSummary,
  LinearTeam,
} from "../contracts";
import { PipesTokens, type LinearTokenSource } from "./pipes";
import { extractPlan } from "./extract";
import { deterministicId, isLockedIssue, LinearClient } from "./linear.client";

const LEASE_MS = 10 * 60 * 1000;

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const flatten = (plan: SyncPlan) =>
  plan.items.flatMap((item) => [item, ...item.children]);

export class LinearService {
  constructor(
    private readonly dependencies: Pick<
      Dependencies,
      "db" | "docsService" | "model"
    >,
    private readonly linear = new LinearClient(),
    private readonly tokens: LinearTokenSource = new PipesTokens(),
  ) {}

  private get db() {
    return this.dependencies.db;
  }

  private async connectionRow(organizationId: string) {
    const [row] = await this.db
      .select()
      .from(linearConnections)
      .where(eq(linearConnections.organizationId, organizationId));
    return row ?? null;
  }

  async status(actor: OrganizationActor): Promise<LinearConnectionData> {
    const membership = await requireOrganizationMember(this.db, actor);
    const row = await this.connectionRow(actor.organizationId);
    return {
      isAdmin: isOrganizationAdmin(membership),
      connection: row && {
        linearOrganizationName: row.linearOrganizationName,
        linearUrlKey: row.linearUrlKey,
        connectedAt: row.connectedAt.toISOString(),
      },
    };
  }

  /**
   * Records the calling admin's WorkOS Pipes connection as the organization's Linear
   * connection. The admin connects Linear with the Pipes widget first. Syncs by any member then
   * use that connection, so issues are created as that admin's Linear user.
   */
  async connect(actor: OrganizationActor) {
    await requireOrganizationAdmin(this.db, actor);
    const token = await this.tokens.get(actor.userId, actor.organizationId);
    const workspace = await this.linear.workspace(token);
    await this.db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(linearConnections)
        .where(eq(linearConnections.organizationId, actor.organizationId))
        .for("update");
      if (previous && previous.linearOrganizationId !== workspace.id) {
        // A different Linear workspace invalidates every team, project, and issue link.
        await tx
          .delete(linearIssueLinks)
          .where(
            inArray(
              linearIssueLinks.docId,
              tx
                .select({ id: linearDocLinks.docId })
                .from(linearDocLinks)
                .where(eq(linearDocLinks.organizationId, actor.organizationId)),
            ),
          );
        await tx
          .delete(linearDocLinks)
          .where(eq(linearDocLinks.organizationId, actor.organizationId));
        await tx
          .delete(linearProjectLinks)
          .where(eq(linearProjectLinks.organizationId, actor.organizationId));
      }
      const values = {
        linearOrganizationId: workspace.id,
        linearOrganizationName: workspace.name,
        linearUrlKey: workspace.urlKey,
        connectedBy: actor.userId,
        connectedAt: new Date(),
      };
      await tx
        .insert(linearConnections)
        .values({ organizationId: actor.organizationId, ...values })
        .onConflictDoUpdate({
          target: linearConnections.organizationId,
          set: values,
        });
    });
  }

  /** Removes the link only. The admin disconnects Linear itself in the Pipes widget. */
  async disconnect(actor: OrganizationActor) {
    await requireOrganizationAdmin(this.db, actor);
    await this.db
      .delete(linearConnections)
      .where(eq(linearConnections.organizationId, actor.organizationId));
  }

  private async token(organizationId: string) {
    const row = await this.connectionRow(organizationId);
    if (!row)
      throw new ApiError(
        409,
        "An organization admin must connect Linear first.",
      );
    return this.tokens.get(row.connectedBy, organizationId);
  }

  async teams(actor: OrganizationActor): Promise<LinearTeam[]> {
    await requireOrganizationMember(this.db, actor);
    return this.linear.teams(await this.token(actor.organizationId));
  }

  private summary(
    row: typeof linearSyncs.$inferSelect,
    versionNumber: number,
  ): LinearSyncSummary {
    return {
      id: row.id,
      status: row.status,
      versionLabel: `v${versionNumber}`,
      error: row.error,
      completed: row.completedKeys.length,
      total: row.plan ? flatten(row.plan).length : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async latestSync(docId: string) {
    const [row] = await this.db
      .select({ sync: linearSyncs, number: docVersions.number })
      .from(linearSyncs)
      .innerJoin(docVersions, eq(docVersions.id, linearSyncs.versionId))
      .where(eq(linearSyncs.docId, docId))
      .orderBy(desc(linearSyncs.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Planned tickets in plan order, marked synced once this run has finished them. */
  private async items(docId: string, run: typeof linearSyncs.$inferSelect) {
    if (!run.plan) return [];
    const links = new Map(
      (
        await this.db
          .select()
          .from(linearIssueLinks)
          .where(eq(linearIssueLinks.docId, docId))
      ).map((link) => [link.itemKey, link]),
    );
    const done = new Set(run.completedKeys);
    const item = (
      node: { key: string; title: string },
      parentKey: string | null,
    ): LinearSyncItem => {
      const link = done.has(node.key) ? links.get(node.key) : undefined;
      return {
        key: node.key,
        title: node.title,
        parentKey,
        state: done.has(node.key) ? "synced" : "missing",
        identifier: link?.identifier ?? null,
        url: link?.url ?? null,
      };
    };
    return run.plan.items.flatMap((parent) => [
      item(parent, null),
      ...parent.children.map((child) => item(child, parent.key)),
    ]);
  }

  async documentStatus(
    actor: OrganizationActor,
    docId: string,
  ): Promise<DocumentLinearData> {
    const membership = await requireOrganizationMember(this.db, actor);
    const meta = await this.dependencies.docsService.getMetadata(actor, docId);
    const [connection, team, docLink, last] = await Promise.all([
      this.connectionRow(actor.organizationId),
      this.db
        .select()
        .from(linearProjectLinks)
        .where(eq(linearProjectLinks.projectId, meta.projectId))
        .then((rows) => rows[0]),
      this.db
        .select()
        .from(linearDocLinks)
        .where(eq(linearDocLinks.docId, docId))
        .then((rows) => rows[0]),
      this.latestSync(docId),
    ]);
    return {
      connected: Boolean(connection),
      isAdmin: isOrganizationAdmin(membership),
      published: meta.latestVersion
        ? { versionLabel: meta.latestVersion }
        : null,
      team: team
        ? { id: team.linearTeamId, name: team.teamName, key: team.teamKey }
        : null,
      projectUrl: docLink?.linearProjectUrl ?? null,
      lastSync: last
        ? {
            ...this.summary(last.sync, last.number),
            items: await this.items(docId, last.sync),
          }
        : null,
    };
  }

  /** Claims the single running slot for a document, or resumes its failed run for this version. */
  private async claim(
    actor: OrganizationActor,
    docId: string,
    versionId: string,
  ) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(linearSyncs)
        .set({
          status: "failed",
          error: "The previous sync was interrupted. Retry it.",
        })
        .where(
          and(
            eq(linearSyncs.docId, docId),
            eq(linearSyncs.status, "running"),
            lt(linearSyncs.leaseUntil, now),
          ),
        );
      const [latest] = await tx
        .select()
        .from(linearSyncs)
        .where(eq(linearSyncs.docId, docId))
        .orderBy(desc(linearSyncs.createdAt))
        .limit(1)
        .for("update");
      if (latest?.status === "running")
        throw new ApiError(409, "A sync is already running for this document.");
      const leaseUntil = new Date(now.getTime() + LEASE_MS);
      if (latest?.status === "failed" && latest.versionId === versionId) {
        const [row] = await tx
          .update(linearSyncs)
          .set({
            status: "running",
            error: null,
            attempts: sql`${linearSyncs.attempts} + 1`,
            leaseUntil,
            updatedAt: now,
          })
          .where(eq(linearSyncs.id, latest.id))
          .returning();
        return row;
      }
      const [row] = await tx
        .insert(linearSyncs)
        .values({
          organizationId: actor.organizationId,
          docId,
          versionId,
          requestedBy: actor.userId,
          leaseUntil,
        })
        .returning();
      return row;
    });
  }

  private async save(
    id: string,
    values: Partial<typeof linearSyncs.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(linearSyncs)
      .set({
        ...values,
        updatedAt: new Date(),
        leaseUntil: new Date(Date.now() + LEASE_MS),
      })
      .where(eq(linearSyncs.id, id))
      .returning();
    return row;
  }

  /**
   * Turns the latest published version into Linear issues. Any member of the organization may
   * run it. Failures are saved on the run, and calling it again resumes the remaining items.
   */
  async sync(
    actor: OrganizationActor,
    docId: string,
    input: { teamId?: string },
  ): Promise<LinearSyncResult> {
    await requireOrganizationMember(this.db, actor);
    const meta = await this.dependencies.docsService.getMetadata(actor, docId);
    if (meta.latestVersionNumber === null)
      throw new ApiError(
        409,
        "Publish this document before syncing it to Linear.",
      );
    const version = await this.dependencies.docsService.getVersion(
      actor,
      docId,
      meta.latestVersionNumber,
    );
    const token = await this.token(actor.organizationId);
    const team = await this.resolveTeam(
      actor,
      meta.projectId,
      token,
      input.teamId,
    );
    const run = await this.claim(actor, docId, version.id);
    const result = { created: 0, updated: 0, skipped: 0 };
    let current = run;
    let projectUrl: string | null = null;
    try {
      const existing = await this.db
        .select()
        .from(linearIssueLinks)
        .where(eq(linearIssueLinks.docId, docId));
      if (!current.plan) {
        const plan = await extractPlan(this.dependencies.model, {
          title: meta.latestTitle ?? version.title,
          content: version.content,
          existing: existing.map((link) => ({
            key: link.itemKey,
            title: link.title,
            parentKey: link.parentKey,
          })),
        });
        current = await this.save(run.id, { plan });
      }
      const plan = current.plan!;
      const docTitle = meta.latestTitle ?? version.title;
      const project = await this.ensureProject(
        token,
        docId,
        actor.organizationId,
        team.id,
        docTitle,
        plan.summary,
      );
      projectUrl = project.url;
      const links = new Map(existing.map((link) => [link.itemKey, link]));
      const done = new Set(current.completedKeys);
      const footer = `\n\n---\nSynced from [${docTitle}](${appOrigin()}/?document=${docId}) ${version.label}.`;
      const process = async (
        node: { key: string; title: string; description: string },
        parentKey: string | null,
      ) => {
        if (done.has(node.key)) return;
        const id = deterministicId(`${docId}:${node.key}`);
        const description = `${node.description}${footer}`;
        const hash = sha(`${node.title}\n${description}\n${parentKey ?? ""}`);
        let issue = await this.linear.issue(token, id);
        let outcome: "created" | "updated" | "skipped" = "skipped";
        if (!issue) {
          issue = await this.linear.createIssue(token, {
            id,
            teamId: team.id,
            projectId: project.id,
            parentId: parentKey
              ? deterministicId(`${docId}:${parentKey}`)
              : undefined,
            title: node.title,
            description,
          });
          outcome = "created";
        } else if (
          !isLockedIssue(issue) &&
          links.get(node.key)?.contentHash !== hash
        ) {
          issue = await this.linear.updateIssue(token, id, {
            title: node.title,
            description,
          });
          outcome = "updated";
        }
        const stored =
          outcome === "skipped" ? links.get(node.key)?.contentHash : undefined;
        const link = {
          docId,
          itemKey: node.key,
          linearIssueId: id,
          identifier: issue.identifier,
          url: issue.url,
          parentKey,
          contentHash: stored ?? hash,
          title: node.title,
        };
        await this.db
          .insert(linearIssueLinks)
          .values(link)
          .onConflictDoUpdate({
            target: [linearIssueLinks.docId, linearIssueLinks.itemKey],
            set: link,
          });
        result[outcome]++;
        done.add(node.key);
        current = await this.save(run.id, { completedKeys: [...done] });
      };
      for (const item of plan.items) {
        await process(item, null);
        for (const child of item.children) await process(child, item.key);
      }
      current = await this.save(run.id, { status: "completed", error: null });
    } catch (error) {
      current = await this.save(run.id, {
        status: "failed",
        error:
          error instanceof ApiError
            ? error.message
            : "The sync stopped unexpectedly. Retry it.",
      });
      if (!(error instanceof ApiError))
        console.error("Linear sync failed", error);
    }
    return {
      sync: this.summary(current, meta.latestVersionNumber),
      ...result,
      projectUrl,
    };
  }

  /** The project's Linear team: remembered once chosen, validated against Linear when first chosen. */
  private async resolveTeam(
    actor: OrganizationActor,
    projectId: string,
    token: string,
    teamId?: string,
  ) {
    const [link] = await this.db
      .select()
      .from(linearProjectLinks)
      .where(eq(linearProjectLinks.projectId, projectId));
    if (link) return { id: link.linearTeamId };
    if (!teamId)
      throw new ApiError(400, "Choose the Linear team for this project.");
    const team = (await this.linear.teams(token)).find(
      (item) => item.id === teamId,
    );
    if (!team) throw new ApiError(400, "That Linear team is not available.");
    await this.db
      .insert(linearProjectLinks)
      .values({
        projectId,
        organizationId: actor.organizationId,
        linearTeamId: team.id,
        teamName: team.name,
        teamKey: team.key,
      })
      .onConflictDoNothing();
    return { id: team.id };
  }

  private async ensureProject(
    token: string,
    docId: string,
    organizationId: string,
    teamId: string,
    name: string,
    summary: string,
  ) {
    const fields = {
      name: name.slice(0, 255),
      description: summary.slice(0, 255),
    };
    const [link] = await this.db
      .select()
      .from(linearDocLinks)
      .where(eq(linearDocLinks.docId, docId));
    if (link) {
      await this.linear.updateProject(token, link.linearProjectId, fields);
      return { id: link.linearProjectId, url: link.linearProjectUrl };
    }
    const id = deterministicId(`${docId}:project`);
    const project =
      (await this.linear.project(token, id)) ??
      (await this.linear.createProject(token, { id, teamId, ...fields }));
    await this.db
      .insert(linearDocLinks)
      .values({
        docId,
        organizationId,
        linearProjectId: project.id,
        linearProjectUrl: project.url,
      })
      .onConflictDoNothing();
    return project;
  }
}
