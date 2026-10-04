import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { githubReviewJobs } from "@stormhacks/data/github-review/schema";
import type {
  ReviewInput,
  ReviewPullRequest,
} from "@stormhacks/data/github-review/contracts";
import { docChanges, docs, docVersions } from "@stormhacks/data/docs/schema";
import {
  githubInstallations,
  githubRepositoryAccess,
} from "@stormhacks/data/github/schema";
import {
  githubRepositories,
  projectRepositories,
  projects,
} from "@stormhacks/data/projects/schema";
import { requireOrganizationMember } from "@/features/organizations/server/membership";
import type { Dependencies } from "@/server/container";
import type { Database } from "@/server/db";
import { ApiError } from "@/server/errors";
import { appOrigin } from "./config";
import { GitHubClient } from "./github.client";
import { evaluateReview, formatReview, reviewMarker } from "./review";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Called inside the existing signed-webhook/delivery transaction. */
export async function enqueueReview(
  tx: Transaction,
  deliveryId: string,
  context: {
    organizationId: string;
    installationId: string;
    repositoryId: string;
    owner: string;
    repository: string;
  },
  pullRequest: ReviewPullRequest,
) {
  const decisions = await tx
    .selectDistinctOn([docs.id], {
      versionId: docVersions.id,
      documentId: docs.id,
      projectId: docs.projectId,
      number: docVersions.number,
      title: docChanges.title,
      content: docChanges.content,
    })
    .from(projectRepositories)
    .innerJoin(projects, eq(projects.id, projectRepositories.projectId))
    .innerJoin(docs, eq(docs.projectId, projects.id))
    .innerJoin(docVersions, eq(docVersions.docId, docs.id))
    .innerJoin(docChanges, eq(docChanges.id, docVersions.changeId))
    .where(
      and(
        eq(projectRepositories.repositoryId, context.repositoryId),
        eq(projectRepositories.organizationId, context.organizationId),
        eq(docs.organizationId, context.organizationId),
        isNull(projects.deletedAt),
        isNull(docs.deletedAt),
      ),
    )
    .orderBy(asc(docs.id), desc(docVersions.number))
    .limit(51);
  const input: ReviewInput = { ...context, pullRequest, decisions };
  const reason =
    pullRequest.draft || pullRequest.state !== "open"
      ? "Draft or closed pull request."
      : !decisions.length
        ? "No published ADRs in a linked project."
        : decisions.length > 50 || JSON.stringify(input).length > 150000
          ? "Published ADRs exceed the review context limit."
          : null;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        repositoryId: context.repositoryId,
        installationId: context.installationId,
        pullRequest,
        versions: decisions.map((d) => d.versionId),
      }),
    )
    .digest("hex");
  await tx
    .insert(githubReviewJobs)
    .values({
      deliveryId,
      ...context,
      pullNumber: pullRequest.number,
      fingerprint,
      input,
      status: reason ? "skipped" : "pending",
      reason,
    })
    .onConflictDoNothing();
}

export class GitHubReviewService {
  constructor(
    private readonly dependencies: Pick<Dependencies, "db" | "model">,
    private readonly github = new GitHubClient(),
  ) {}

  async getDecision(userId: string, versionId: string) {
    const [row] = await this.dependencies.db
      .select({
        organizationId: docs.organizationId,
        versionId: docVersions.id,
        documentId: docs.id,
        number: docVersions.number,
        title: docChanges.title,
        content: docChanges.content,
        publishedAt: docVersions.publishedAt,
      })
      .from(docVersions)
      .innerJoin(docs, eq(docs.id, docVersions.docId))
      .innerJoin(projects, eq(projects.id, docs.projectId))
      .innerJoin(docChanges, eq(docChanges.id, docVersions.changeId))
      .where(
        and(
          eq(docVersions.id, versionId),
          isNull(docs.deletedAt),
          isNull(projects.deletedAt),
        ),
      );
    if (!row) throw new ApiError(404, "Published decision not found.");
    await requireOrganizationMember(this.dependencies.db, {
      userId,
      organizationId: row.organizationId,
    });
    return row;
  }

  private async claim() {
    return this.dependencies.db.transaction(async (tx) => {
      // ponytail: brief global claim lock; partition by repository if admission throughput matters.
      // It prevents two workers claiming different jobs for the same PR concurrently.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('github-review-claim'))`,
      );
      await tx
        .update(githubReviewJobs)
        .set({
          status: "failed",
          reason: "Review attempts exhausted after worker interruption.",
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          sql`${githubReviewJobs.status} = 'processing' and ${githubReviewJobs.leaseUntil} <= now() and ${githubReviewJobs.attempts} >= 3`,
        );
      const [job] = await tx
        .select()
        .from(githubReviewJobs)
        .where(
          sql`
        ${githubReviewJobs.attempts} < 3 and (
          (${githubReviewJobs.status} = 'pending' and ${githubReviewJobs.availableAt} <= now()) or
          (${githubReviewJobs.status} = 'processing' and ${githubReviewJobs.leaseUntil} <= now())
        ) and not exists (
          select 1 from github_review_jobs running where running.repository_id = ${githubReviewJobs.repositoryId}
            and running.pull_number = ${githubReviewJobs.pullNumber} and running.status = 'processing'
            and running.lease_until > now()
        )`,
        )
        .orderBy(asc(githubReviewJobs.createdAt), asc(githubReviewJobs.id))
        .limit(1)
        .for("update");
      if (!job) return null;
      const [claimed] = await tx
        .update(githubReviewJobs)
        .set({
          status: "processing",
          attempts: job.attempts + 1,
          leaseToken: randomUUID(),
          leaseUntil: new Date(Date.now() + 10 * 60000),
          reason: null,
        })
        .where(eq(githubReviewJobs.id, job.id))
        .returning();
      return claimed;
    });
  }

  private async access(input: ReviewInput) {
    const [row] = await this.dependencies.db
      .select({
        githubId: githubRepositoryAccess.githubId,
        owner: githubRepositories.owner,
        name: githubRepositories.name,
      })
      .from(githubRepositoryAccess)
      .innerJoin(
        githubInstallations,
        eq(githubInstallations.id, githubRepositoryAccess.installationId),
      )
      .innerJoin(
        githubRepositories,
        eq(githubRepositories.id, githubRepositoryAccess.repositoryId),
      )
      .where(
        and(
          eq(githubRepositoryAccess.repositoryId, input.repositoryId),
          eq(githubRepositoryAccess.organizationId, input.organizationId),
          eq(githubRepositoryAccess.installationId, input.installationId),
          eq(githubInstallations.active, true),
          eq(githubRepositoryAccess.authorized, true),
          eq(githubRepositoryAccess.available, true),
        ),
      );
    return row;
  }

  /** One bounded review per invocation. The cron trigger recovers missed invocations and retries. */
  async processNext() {
    const job = await this.claim();
    if (!job) return;
    const owned = and(
      eq(githubReviewJobs.id, job.id),
      eq(githubReviewJobs.leaseToken, job.leaseToken!),
      eq(githubReviewJobs.status, "processing"),
      sql`${githubReviewJobs.leaseUntil} > now()`,
    );
    const finish = async (
      status: "completed" | "skipped",
      reason: string | null,
      reviewId?: string,
    ) => {
      await this.dependencies.db
        .update(githubReviewJobs)
        .set({ status, reason, reviewId, leaseUntil: null, leaseToken: null })
        .where(owned);
    };
    try {
      const access = await this.access(job.input);
      if (!access) {
        await finish("skipped", "Repository installation access was revoked.");
        return;
      }
      const input = {
        ...job.input,
        owner: access.owner,
        repository: access.name,
      };
      const token = await this.github.installationToken(
        input.installationId,
        Number(access.githubId),
      );
      const args = [
        token,
        input.owner,
        input.repository,
        input.pullRequest.number,
      ] as const;
      const current = await this.github.pullRequest(...args);
      const applicable = (pr: ReviewPullRequest) =>
        pr.state === "open" &&
        !pr.draft &&
        pr.head.sha === input.pullRequest.head.sha &&
        pr.base.sha === input.pullRequest.base.sha &&
        pr.title === input.pullRequest.title &&
        pr.body === input.pullRequest.body;
      if (!applicable(current)) {
        await finish(
          "skipped",
          "Pull request changed after this review was queued.",
        );
        return;
      }
      const existing = await this.github.findReview(
        ...args,
        reviewMarker(job.id),
      );
      if (existing) {
        await finish("completed", null, existing);
        return;
      }
      let result = job.result;
      if (!result) {
        const files = await this.github.pullRequestFiles(
          ...args,
          current.changed_files,
        );
        // Paginated file reads refer to a moving PR; verify both commit IDs again before evaluation.
        if (!applicable(await this.github.pullRequest(...args))) {
          await finish(
            "skipped",
            "Pull request changed while gathering evidence.",
          );
          return;
        }
        result = await evaluateReview(this.dependencies.model, input, files);
        const saved = await this.dependencies.db
          .update(githubReviewJobs)
          .set({ result })
          .where(owned)
          .returning({ id: githubReviewJobs.id });
        if (!saved.length) return;
      }
      // Recheck access and head immediately before the only GitHub write.
      if (
        !(await this.access(input)) ||
        !applicable(await this.github.pullRequest(...args))
      ) {
        await finish(
          "skipped",
          "Pull request or repository access changed before posting.",
        );
        return;
      }
      const [lease] = await this.dependencies.db
        .select({ id: githubReviewJobs.id })
        .from(githubReviewJobs)
        .where(owned);
      if (!lease) return;
      const review = await this.github.createReview(
        ...args,
        formatReview(job.id, input, result, appOrigin()),
      );
      await finish("completed", null, review.id);
    } catch (error) {
      const reason =
        error instanceof ApiError
          ? error.message
          : "Reviewer provider or processing failed.";
      await this.dependencies.db
        .update(githubReviewJobs)
        .set({
          status: job.attempts >= 3 ? "failed" : "pending",
          reason,
          availableAt: new Date(Date.now() + job.attempts * 60000),
          leaseToken: null,
          leaseUntil: null,
        })
        .where(owned);
      // Provider details, code, decision content, and credentials must not enter logs.
      console.error("GitHub ADR review failed", {
        jobId: job.id,
        attempt: job.attempts,
      });
    }
  }
}
