import { fakeWorkOS } from "../../../../tests/workos";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  DocsService,
  OrganizationsService,
  ProjectsService,
} from "@stormhacks/data";
import type { ReviewPullRequest } from "@stormhacks/data/github-review/contracts";
import type { Database } from "@/server/db";
import type { ModelPort } from "@/features/planning/server/model";
import { GitHubService, webhookSchema } from "./github.service";
import { GitHubController } from "./github.controller";
import { GitHubReviewService } from "./github-review.service";

const workos = fakeWorkOS();
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => workos,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "GitHub ADR reviewer with real Postgres",
  () => {
    const databaseName = `adr_review_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let db: Database;
    let created = false;
    let docs: DocsService;
    let projects: ProjectsService;
    let actor: { userId: string; organizationId: string };
    let service: GitHubService;
    let reviewer: GitHubReviewService;
    let repositoryId: string;
    let projectId: string;
    let documentId: string;
    let versionId: string;
    let pr: ReviewPullRequest;
    const generateObject = vi.fn();
    const fetcher = vi.fn<typeof fetch>();
    let posted: {
      id: number;
      body: string;
      user: { type: string; login: string };
    }[];
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs1", format: "pem" })
      .toString();

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 8 });
      db = drizzle(client);
      await migrate(db, { migrationsFolder: "drizzle" });
      await migrate(db, { migrationsFolder: "drizzle" });
      docs = new DocsService({ db });
      projects = new ProjectsService({ db });
      const organization = await new OrganizationsService({ db }).create(
        "review-user",
        "Review test",
      );
      actor = { userId: "review-user", organizationId: organization.id };
    });
    afterAll(async () => {
      try {
        if (client) await client.end();
        if (created) await admin.unsafe(`DROP DATABASE ${databaseName}`);
      } finally {
        if (admin) await admin.end();
      }
    });
    beforeEach(async () => {
      await client`DELETE FROM github_review_jobs`;
      await client`DELETE FROM github_deliveries`;
      await client`DELETE FROM github_repository_access`;
      await client`DELETE FROM github_installations`;
      await client`DELETE FROM project_repositories`;
      await client`DELETE FROM github_repositories`;
      for (const [key, value] of Object.entries({
        GITHUB_APP_ID: "42",
        GITHUB_APP_SLUG: "review-app",
        GITHUB_CLIENT_ID: "review-client",
        GITHUB_CLIENT_SECRET: "secret",
        GITHUB_PRIVATE_KEY: privateKey,
        GITHUB_WEBHOOK_SECRET: "webhook-secret",
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://app.test/callback",
      }))
        vi.stubEnv(key, value);
      const project = await projects.create(actor, { name: "Todo" });
      projectId = project.id;
      const doc = await docs.create(actor, projectId, {
        title: "Todo creation",
        content: "Failed creation must not automatically retry.",
      });
      documentId = doc.id;
      const [first] = await docs.listChanges(actor, doc.id);
      versionId = (await docs.publish(actor, doc.id, first.id)).id;
      const repository = await projects.connectRepository(actor, {
        owner: "team",
        name: "todo",
      });
      repositoryId = repository.id;
      await projects.linkRepository(actor, projectId, repositoryId);
      await client`INSERT INTO github_installations(id, organization_id, account_login, connected_by, github_user_id, github_user_login)
      VALUES ('500', ${actor.organizationId}, 'team', 'review-user', '10', 'review-user')`;
      await client`INSERT INTO github_repository_access(repository_id, organization_id, installation_id, github_id)
      VALUES (${repositoryId}, ${actor.organizationId}, '500', '101')`;
      pr = {
        number: 1,
        title: "Implement todo creation",
        body: "This PR implements creation only.",
        draft: false,
        state: "open",
        head: { sha: "a".repeat(40) },
        base: { sha: "b".repeat(40) },
      };
      posted = [];
      fetcher.mockReset();
      generateObject.mockReset();
      generateObject.mockImplementation(async (request) => {
        const evidence = JSON.parse(request.messages[0].content);
        const decision = evidence.publishedDecisions.find(
          (d: { documentId: string }) => d.documentId === documentId,
        );
        return {
          summary: "Automatic retries conflict with the published decision.",
          limitations: [],
          findings: [
            {
              category: "direct contradiction",
              versionId: decision.versionId,
              decisionQuote: "Failed creation must not automatically retry.",
              path: "todo.ts",
              line: 1,
              side: "RIGHT",
              codeQuote: "retry(() => createTodo());",
              explanation: "Creation is automatically retried.",
              suggestion: "Remove retries or publish an agreed amendment.",
            },
          ],
        };
      });
      fetcher.mockImplementation(async (url, init) => {
        const parsed = new URL(String(url));
        if (parsed.pathname === "/app/installations/500/access_tokens")
          return Response.json({ token: "review-token" });
        if (parsed.pathname === "/repos/team/todo/pulls/1")
          return Response.json({ ...pr, changed_files: 1 });
        if (parsed.pathname.endsWith("/files"))
          return Response.json([
            {
              filename: "todo.ts",
              status: "added",
              additions: 1,
              deletions: 0,
              changes: 1,
              patch: "@@ -0,0 +1 @@\n+retry(() => createTodo());",
            },
          ]);
        if (parsed.pathname.endsWith("/reviews")) {
          if (init?.method === "POST") {
            const payload = JSON.parse(init.body as string);
            expect(payload.event).toBe("COMMENT");
            expect(payload.commit_id).toBe("a".repeat(40));
            const review = {
              id: posted.length + 1,
              body: payload.body,
              user: { type: "Bot", login: "review-app[bot]" },
            };
            posted.push(review);
            return Response.json(review);
          }
          return Response.json(posted);
        }
        throw new Error(`Unexpected GitHub test request: ${parsed.pathname}`);
      });
      vi.stubGlobal("fetch", fetcher);
      service = new GitHubService({ db });
      reviewer = new GitHubReviewService({
        db,
        model: { generateObject } as unknown as ModelPort,
      });
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const payload = () =>
      webhookSchema.parse({
        action: "opened",
        installation: { id: 500 },
        repository: { id: 101, name: "todo", owner: { login: "team" } },
        pull_request: pr,
      });
    const enqueue = (delivery = randomUUID()) =>
      service.webhook(delivery, "pull_request", payload());
    const jobs = () =>
      client`SELECT * FROM github_review_jobs ORDER BY created_at`;

    it("admits a signed webhook once, includes all linked published ADRs, and excludes drafts and unrelated projects", async () => {
      const otherDoc = await docs.create(actor, projectId, {
        title: "UI",
        content: "Creation must have one submit button.",
      });
      const [otherChange] = await docs.listChanges(actor, otherDoc.id);
      await docs.publish(actor, otherDoc.id, otherChange.id);
      await docs.addChange(actor, documentId, {
        title: "Draft",
        content: "DRAFT ONLY: Retries are now allowed.",
      });
      await docs.create(actor, projectId, {
        title: "Unpublished",
        content: "UNPUBLISHED ONLY",
      });
      const otherProject = await projects.create(actor, { name: "Unrelated" });
      const unrelated = await docs.create(actor, otherProject.id, {
        title: "Unrelated",
        content: "UNRELATED ONLY",
      });
      const [unrelatedChange] = await docs.listChanges(actor, unrelated.id);
      await docs.publish(actor, unrelated.id, unrelatedChange.id);
      const delivery = randomUUID();
      const raw = JSON.stringify({
        action: "opened",
        installation: { id: 500 },
        repository: { id: 101, name: "todo", owner: { login: "team" } },
        pull_request: pr,
      });
      const controller = new GitHubController({
        authService: { requireUser: vi.fn() },
        githubService: service,
      });
      const request = () =>
        new Request("https://app.test/api/github/webhooks", {
          method: "POST",
          body: raw,
          headers: {
            "content-type": "application/json",
            "x-github-event": "pull_request",
            "x-github-delivery": delivery,
            "x-hub-signature-256": `sha256=${createHmac("sha256", "webhook-secret").update(raw).digest("hex")}`,
          },
        });
      const admitted = await Promise.all([
        controller.webhook(request()),
        controller.webhook(request()),
      ]);
      expect(admitted.map((r) => r.status)).toEqual([202, 202]);
      const [job] = await jobs();
      expect((await jobs()).length).toBe(1);
      expect(job.input.decisions).toHaveLength(2);
      expect(JSON.stringify(job.input)).not.toMatch(
        /DRAFT ONLY|UNPUBLISHED ONLY|UNRELATED ONLY/,
      );
      expect(
        job.input.decisions.find(
          (d: { documentId: string }) => d.documentId === documentId,
        ).versionId,
      ).toBe(versionId);
    });

    it("pins v1 through later draft edits and publication, posts exact citations, and disposes of concurrent duplicate claims", async () => {
      await enqueue();
      const second = await docs.addChange(actor, documentId, {
        title: "New version",
        content: "Retries are allowed in v2.",
      });
      await docs.publish(actor, documentId, second.id);
      await Promise.all([reviewer.processNext(), reviewer.processNext()]);
      expect(generateObject).toHaveBeenCalledTimes(1);
      expect(posted).toHaveLength(1);
      expect(posted[0].body).toContain(`/api/github/decisions/${versionId}`);
      expect(JSON.stringify(generateObject.mock.calls)).not.toContain(
        "Retries are allowed in v2.",
      );
      expect((await jobs())[0]).toMatchObject({
        status: "completed",
        review_id: "1",
        attempts: 1,
      });
      const writeToken = fetcher.mock.calls.find((call) =>
        String(call[0]).endsWith("/access_tokens"),
      )![1]!;
      expect(JSON.parse(writeToken.body as string)).toEqual({
        repository_ids: [101],
        permissions: {
          metadata: "read",
          contents: "read",
          pull_requests: "write",
        },
      });
      const post = fetcher.mock.calls.find(
        (call) =>
          call[1]?.method === "POST" && String(call[0]).endsWith("/reviews"),
      )!;
      const comment = JSON.parse(post[1]!.body as string).comments[0];
      expect(comment).toMatchObject({
        path: "todo.ts",
        line: 1,
        side: "RIGHT",
      });
      expect(comment.body).toContain(
        "Failed creation must not automatically retry.",
      );
    });

    it("recovers an uncertain GitHub write without regenerating or posting a duplicate review", async () => {
      await enqueue();
      const normal = fetcher.getMockImplementation()!;
      fetcher.mockImplementation(async (url, init) => {
        const response = await normal(url, init);
        if (init?.method === "POST" && String(url).endsWith("/reviews"))
          throw new Error("lost response containing private-provider-details");
        return response;
      });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await reviewer.processNext();
      expect((await jobs())[0]).toMatchObject({ status: "pending" });
      expect(posted).toHaveLength(1);
      await client`UPDATE github_review_jobs SET available_at = now()`;
      fetcher.mockImplementation(normal);
      await reviewer.processNext();
      expect(posted).toHaveLength(1);
      expect(generateObject).toHaveBeenCalledTimes(1);
      expect((await jobs())[0]).toMatchObject({
        status: "completed",
        attempts: 2,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "private-provider-details",
      );
    });

    it("skips stale heads and lost access rather than posting obsolete findings", async () => {
      await enqueue();
      pr = { ...pr, head: { sha: "c".repeat(40) } };
      await reviewer.processNext();
      expect((await jobs())[0].status).toBe("skipped");
      expect(generateObject).not.toHaveBeenCalled();
      expect(posted).toHaveLength(0);
      await enqueue();
      await client`UPDATE github_repository_access SET available = false`;
      await reviewer.processNext();
      expect((await jobs())[1].status).toBe("skipped");
      expect(posted).toHaveLength(0);
    });

    it("rechecks the PR after model generation", async () => {
      await enqueue();
      const normal = generateObject.getMockImplementation()!;
      generateObject.mockImplementation(async (request) => {
        const result = await normal(request);
        pr = { ...pr, draft: true };
        return result;
      });
      await reviewer.processNext();
      expect(posted).toHaveLength(0);
      expect((await jobs())[0].status).toBe("skipped");
    });

    it("rejects hallucinated citations and bounds retries without exposing model content", async () => {
      await enqueue();
      const normal = generateObject.getMockImplementation()!;
      generateObject.mockImplementation(async (request) => {
        const result = await normal(request);
        result.findings[0].decisionQuote = "Invented requirement is forbidden.";
        return result;
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      for (let attempt = 0; attempt < 3; attempt++) {
        await client`UPDATE github_review_jobs SET available_at = now()`;
        await reviewer.processNext();
      }
      expect((await jobs())[0]).toMatchObject({
        status: "failed",
        attempts: 3,
      });
      expect(posted).toHaveLength(0);
    });

    it("records no-publication and draft skips, deduplicates equivalent events, and uses v2 for a new review", async () => {
      await enqueue();
      await enqueue();
      expect(await jobs()).toHaveLength(1);
      const change = await docs.addChange(actor, documentId, {
        title: "Amended",
        content: "Retries are allowed.",
      });
      const v2 = await docs.publish(actor, documentId, change.id);
      await enqueue();
      expect((await jobs())[1].input.decisions[0].versionId).toBe(v2.id);
      pr = { ...pr, draft: true };
      await enqueue();
      expect((await jobs())[2].status).toBe("skipped");
      await projects.unlinkRepository(actor, projectId, repositoryId);
      pr = { ...pr, draft: false };
      await enqueue();
      expect((await jobs())[3]).toMatchObject({
        status: "skipped",
        reason: "No published ADRs in a linked project.",
      });
    });

    it("recovers expired leases and serves frozen publication citations only to members", async () => {
      await enqueue();
      await client`UPDATE github_review_jobs SET status = 'processing', attempts = 1, lease_token = ${randomUUID()}, lease_until = now() - interval '1 minute'`;
      await reviewer.processNext();
      expect((await jobs())[0]).toMatchObject({
        status: "completed",
        attempts: 2,
      });
      const frozen = await reviewer.getDecision(actor.userId, versionId);
      expect(frozen.content).toBe(
        "Failed creation must not automatically retry.",
      );
      await expect(
        reviewer.getDecision("stranger", versionId),
      ).rejects.toMatchObject({ status: 404 });
    });
  },
);
