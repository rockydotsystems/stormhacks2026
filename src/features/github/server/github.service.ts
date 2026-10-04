import "server-only";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import {
  githubDeliveries,
  githubInstallations,
  githubOAuthStates,
  githubRepositoryAccess,
} from "@stormhacks/data/github/schema";
import { githubRepositories } from "@/features/projects/server/schema";
import { requireOrganizationMember } from "@/features/organizations/server/membership";
import type { OrganizationActor } from "@stormhacks/data";
import type { Dependencies } from "@/server/container";
import type { Database } from "@/server/db";
import { ApiError } from "@/server/errors";
import type { GitHubConnection } from "../contracts";
import { appOrigin, getGitHubConfig, isGitHubConfigured } from "./config";
import {
  GitHubClient,
  remoteRepositorySchema,
  type RemoteRepository,
} from "./github.client";
import { challenge, hashState, randomState } from "./security";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const remoteId = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .transform(String);
export const webhookSchema = z.object({
  action: z.string().max(100).optional(),
  installation: z.object({ id: remoteId }).optional(),
  repository: remoteRepositorySchema.optional(),
  repositories_removed: z.array(z.object({ id: remoteId })).optional(),
});
export type WebhookPayload = z.infer<typeof webhookSchema>;
export const supportedEvents = new Set([
  "installation",
  "installation_repositories",
  "repository",
  "push",
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
]);

export class GitHubService {
  private readonly github = new GitHubClient();
  constructor(private readonly dependencies: Pick<Dependencies, "db">) {}

  async begin(actor: OrganizationActor, accountLogin: string) {
    await requireOrganizationMember(this.dependencies.db, actor);
    const config = getGitHubConfig();
    const state = randomState();
    const verifier = randomState();
    const redirectUri = `${appOrigin()}/api/github/callback`;
    await this.dependencies.db.transaction(async (tx) => {
      await tx
        .delete(githubOAuthStates)
        .where(lt(githubOAuthStates.expiresAt, new Date()));
      await tx
        .delete(githubOAuthStates)
        .where(eq(githubOAuthStates.userId, actor.userId));
      await tx.insert(githubOAuthStates).values({
        hash: hashState(state),
        ...actor,
        accountLogin,
        verifier,
        redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge(verifier),
      code_challenge_method: "S256",
    }).toString();
    return { state, url: url.toString() };
  }

  async consumeState(userId: string, state: string) {
    const [row] = await this.dependencies.db
      .delete(githubOAuthStates)
      .where(
        and(
          eq(githubOAuthStates.hash, hashState(state)),
          eq(githubOAuthStates.userId, userId),
          gt(githubOAuthStates.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row)
      throw new ApiError(
        400,
        "GitHub connection expired. Try connecting again.",
      );
    await requireOrganizationMember(this.dependencies.db, {
      userId,
      organizationId: row.organizationId,
    });
    return row;
  }

  async complete(userId: string, state: string, code: string) {
    const context = await this.consumeState(userId, state);
    const actor = { userId, organizationId: context.organizationId };
    const token = await this.github.exchangeCode(
      code,
      context.verifier,
      context.redirectUri,
    );
    const [user, installations] = await Promise.all([
      this.github.user(token),
      this.github.installations(token),
    ]);
    const installation = installations.find(
      (item) =>
        item.app_id === getGitHubConfig().appId &&
        item.account.login.toLowerCase() === context.accountLogin.toLowerCase(),
    );
    if (!installation || installation.suspended_at)
      throw new ApiError(
        403,
        "Install the GitHub App on that account, then connect again. Suspended installations must be restored first.",
      );
    // User-to-server access is narrower than app access. Never enroll repositories this person cannot read.
    const repositories = await this.github.userRepositories(
      token,
      installation.id,
    );
    if (!repositories.length)
      throw new ApiError(
        403,
        "No repositories are accessible. Select repositories in the GitHub App installation, then connect again.",
      );
    await this.dependencies.db.transaction(async (tx) => {
      await requireOrganizationMember(tx, actor);
      await tx
        .insert(githubInstallations)
        .values({
          id: installation.id,
          organizationId: actor.organizationId,
          accountLogin: installation.account.login,
          connectedBy: userId,
          githubUserId: user.id,
          githubUserLogin: user.login,
        })
        .onConflictDoNothing();
      const [current] = await tx
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, installation.id))
        .for("update");
      if (current.organizationId !== actor.organizationId)
        throw new ApiError(
          409,
          "This GitHub installation is already connected to another organization.",
        );
      await tx
        .update(githubInstallations)
        .set({
          accountLogin: installation.account.login,
          connectedBy: userId,
          githubUserId: user.id,
          githubUserLogin: user.login,
          active: true,
        })
        .where(eq(githubInstallations.id, installation.id));
      await tx
        .update(githubRepositoryAccess)
        .set({ available: false, authorized: false })
        .where(eq(githubRepositoryAccess.installationId, installation.id));
      for (const repository of repositories)
        await this.enroll(
          tx,
          actor.organizationId,
          installation.id,
          repository,
        );
    });
    return actor.organizationId;
  }

  private async enroll(
    tx: Transaction,
    organizationId: string,
    installationId: string,
    repository: RemoteRepository,
  ) {
    const [existing] = await tx
      .select()
      .from(githubRepositoryAccess)
      .where(
        and(
          eq(githubRepositoryAccess.installationId, installationId),
          eq(githubRepositoryAccess.githubId, repository.id),
        ),
      );
    const values = {
      owner: repository.owner.login.toLowerCase(),
      name: repository.name.toLowerCase(),
    };
    if (existing) {
      await tx
        .update(githubRepositories)
        .set(values)
        .where(eq(githubRepositories.id, existing.repositoryId));
      await tx
        .update(githubRepositoryAccess)
        .set({ available: true, authorized: true })
        .where(eq(githubRepositoryAccess.repositoryId, existing.repositoryId));
      return;
    }
    await tx
      .insert(githubRepositories)
      .values({ organizationId, ...values })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(githubRepositories)
      .where(
        and(
          eq(githubRepositories.organizationId, organizationId),
          eq(githubRepositories.owner, values.owner),
          eq(githubRepositories.name, values.name),
        ),
      );
    const [access] = await tx
      .select()
      .from(githubRepositoryAccess)
      .where(eq(githubRepositoryAccess.repositoryId, row.id));
    if (access) {
      const [previous] = await tx
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, access.installationId))
        .for("update");
      if (access.githubId !== repository.id || previous.active)
        throw new ApiError(
          409,
          "A repository with that name has a different GitHub identity. Resolve the existing connection first.",
        );
      await tx
        .update(githubRepositoryAccess)
        .set({ installationId, authorized: true, available: true })
        .where(eq(githubRepositoryAccess.repositoryId, row.id));
      return;
    }
    await tx
      .insert(githubRepositoryAccess)
      .values({
        repositoryId: row.id,
        organizationId,
        installationId,
        githubId: repository.id,
      })
      .onConflictDoNothing();
  }

  async status(actor: OrganizationActor): Promise<GitHubConnection> {
    await requireOrganizationMember(this.dependencies.db, actor);
    const db = this.dependencies.db;
    const [installations, repositories, activity] = await Promise.all([
      db
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.organizationId, actor.organizationId))
        .orderBy(asc(githubInstallations.accountLogin)),
      db
        .select({
          id: githubRepositories.id,
          owner: githubRepositories.owner,
          name: githubRepositories.name,
          available: githubRepositoryAccess.available,
          installationId: githubRepositoryAccess.installationId,
        })
        .from(githubRepositoryAccess)
        .innerJoin(
          githubRepositories,
          eq(githubRepositories.id, githubRepositoryAccess.repositoryId),
        )
        .where(eq(githubRepositoryAccess.organizationId, actor.organizationId))
        .orderBy(asc(githubRepositories.name)),
      db
        .select({
          id: githubDeliveries.id,
          event: githubDeliveries.event,
          action: githubDeliveries.action,
          receivedAt: githubDeliveries.receivedAt,
          owner: githubRepositories.owner,
          name: githubRepositories.name,
        })
        .from(githubDeliveries)
        .innerJoin(
          githubInstallations,
          eq(githubInstallations.id, githubDeliveries.installationId),
        )
        .leftJoin(
          githubRepositories,
          eq(githubRepositories.id, githubDeliveries.repositoryId),
        )
        .where(eq(githubInstallations.organizationId, actor.organizationId))
        .orderBy(desc(githubDeliveries.receivedAt))
        .limit(20),
    ]);
    const configured = isGitHubConfigured();
    return {
      configured,
      installUrl: configured
        ? `https://github.com/apps/${getGitHubConfig().slug}/installations/new`
        : null,
      installations: installations.map((row) => ({
        id: row.id,
        accountLogin: row.accountLogin,
        githubUserLogin: row.githubUserLogin,
        active: row.active,
        repositories: repositories
          .filter((repo) => repo.installationId === row.id)
          .map(({ id, owner, name, available }) => ({
            id,
            owner,
            name,
            available,
          })),
      })),
      activity: activity.map((row) => ({
        id: row.id,
        event: row.event,
        action: row.action,
        receivedAt: row.receivedAt.toISOString(),
        repository: row.owner && row.name ? `${row.owner}/${row.name}` : null,
      })),
    };
  }

  async sync(actor: OrganizationActor, installationId: string) {
    const db = this.dependencies.db;
    await requireOrganizationMember(db, actor);
    const [installation] = await db
      .select()
      .from(githubInstallations)
      .where(
        and(
          eq(githubInstallations.id, installationId),
          eq(githubInstallations.organizationId, actor.organizationId),
        ),
      );
    if (!installation) throw new ApiError(404, "GitHub connection not found.");
    if (!installation.active)
      throw new ApiError(
        409,
        "Restore the GitHub installation and connect again.",
      );
    const token = await this.github.installationToken(installationId);
    const repositories = await this.github.installationRepositories(token);
    await db.transaction(async (tx) => {
      await requireOrganizationMember(tx, actor);
      const [current] = await tx
        .select()
        .from(githubInstallations)
        .where(
          and(
            eq(githubInstallations.id, installationId),
            eq(githubInstallations.organizationId, actor.organizationId),
          ),
        )
        .for("update");
      if (!current?.active)
        throw new ApiError(409, "GitHub connection is no longer active.");
      const enrolled = await tx
        .select()
        .from(githubRepositoryAccess)
        .where(eq(githubRepositoryAccess.installationId, installationId));
      await tx
        .update(githubRepositoryAccess)
        .set({ available: false })
        .where(eq(githubRepositoryAccess.installationId, installationId));
      const approved = new Set(
        enrolled.filter((row) => row.authorized).map((row) => row.githubId),
      );
      for (const repo of repositories)
        if (approved.has(repo.id))
          await this.enroll(tx, actor.organizationId, installationId, repo);
    });
  }

  async webhook(deliveryId: string, event: string, payload: WebhookPayload) {
    const installationId = payload.installation?.id;
    if (!installationId) return;
    await this.dependencies.db.transaction(async (tx) => {
      const [installation] = await tx
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, installationId))
        .for("update");
      if (!installation) return;
      const [repository] = payload.repository
        ? await tx
            .select()
            .from(githubRepositoryAccess)
            .where(
              and(
                eq(githubRepositoryAccess.installationId, installationId),
                eq(githubRepositoryAccess.githubId, payload.repository.id),
              ),
            )
        : [];
      if (payload.repository && !repository) return;
      if (
        repository &&
        (!repository.authorized ||
          (!repository.available && event !== "repository"))
      )
        return;
      const [delivery] = await tx
        .insert(githubDeliveries)
        .values({
          id: deliveryId,
          installationId,
          repositoryId: repository?.repositoryId,
          event,
          action: payload.action,
        })
        .onConflictDoNothing()
        .returning();
      if (!delivery) return;
      if (
        event === "installation" &&
        ["deleted", "suspend"].includes(payload.action || "")
      ) {
        await tx
          .update(githubInstallations)
          .set({ active: false })
          .where(eq(githubInstallations.id, installationId));
        await tx
          .update(githubRepositoryAccess)
          .set({ available: false })
          .where(eq(githubRepositoryAccess.installationId, installationId));
      }
      // Unsuspension and newly selected repositories require a fresh OAuth connection; no automatic access expansion.
      if (!installation.active) return;
      if (event === "installation_repositories") {
        const removedIds =
          payload.repositories_removed?.map((repo) => repo.id) || [];
        if (removedIds.length)
          await tx
            .update(githubRepositoryAccess)
            .set({ available: false })
            .where(
              and(
                eq(githubRepositoryAccess.installationId, installationId),
                inArray(githubRepositoryAccess.githubId, removedIds),
              ),
            );
      }
      if (event === "repository" && repository && payload.repository) {
        if (["deleted", "transferred"].includes(payload.action || "")) {
          await tx
            .update(githubRepositoryAccess)
            .set({ available: false })
            .where(
              eq(githubRepositoryAccess.repositoryId, repository.repositoryId),
            );
        } else if (repository.available && payload.action === "renamed") {
          await tx
            .update(githubRepositories)
            .set({
              owner: payload.repository.owner.login.toLowerCase(),
              name: payload.repository.name.toLowerCase(),
            })
            .where(eq(githubRepositories.id, repository.repositoryId));
        }
      }
    });
  }
}
