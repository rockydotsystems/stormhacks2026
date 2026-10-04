import { fakeWorkOS } from "../../../../tests/workos";
import { generateKeyPairSync, randomUUID } from "node:crypto";
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
import { OrganizationsService, ProjectsService } from "@stormhacks/data";
import { GitHubService, webhookSchema } from "./github.service";
import type { Database } from "@/server/db";

const workos = fakeWorkOS();
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => workos,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "GitHub integration with real Postgres",
  () => {
    const databaseName = `github_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let db: Database;
    let service: GitHubService;
    let projects: ProjectsService;
    let actor: { userId: string; organizationId: string };
    let other: typeof actor;
    let created = false;
    let visible: { id: number; name: string; owner: { login: string } }[];
    let installed: typeof visible;
    const fetcher = vi.fn<typeof fetch>();
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs1", format: "pem" })
      .toString();

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      db = drizzle(client);
      await migrate(db, { migrationsFolder: "drizzle" });
      await migrate(db, { migrationsFolder: "drizzle" });
      const organizations = new OrganizationsService({ db });
      const first = await organizations.create("github-user", "GitHub test");
      const second = await organizations.create("other-user", "Other test");
      actor = { userId: "github-user", organizationId: first.id };
      other = { userId: "other-user", organizationId: second.id };
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
      await client`DELETE FROM github_deliveries`;
      await client`DELETE FROM github_repository_access`;
      await client`DELETE FROM github_installations`;
      await client`DELETE FROM github_oauth_states`;
      await client`DELETE FROM project_repositories`;
      await client`DELETE FROM github_repositories`;
      vi.stubEnv(
        "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
        "https://app.test/callback",
      );
      vi.stubEnv("GITHUB_APP_ID", "42");
      vi.stubEnv("GITHUB_APP_SLUG", "test-app");
      vi.stubEnv("GITHUB_CLIENT_ID", "test-client");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
      vi.stubEnv("GITHUB_WEBHOOK_SECRET", "test-webhook-secret");
      vi.stubEnv("GITHUB_PRIVATE_KEY", privateKey);
      visible = [{ id: 101, name: "repo", owner: { login: "GitHubOrg" } }];
      installed = [
        ...visible,
        { id: 102, name: "hidden", owner: { login: "GitHubOrg" } },
      ];
      fetcher.mockReset();
      fetcher.mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/login/oauth/access_token")
          return Response.json({
            access_token: "transient-user-token",
            refresh_token: "discarded",
          });
        if (url.pathname === "/user")
          return Response.json({ id: 10, login: "connecting-user" });
        if (url.pathname === "/user/installations")
          return Response.json({
            total_count: 1,
            installations: [
              {
                id: 500,
                app_id: 42,
                account: { login: "GitHubOrg" },
                suspended_at: null,
              },
            ],
          });
        if (url.pathname === "/user/installations/500/repositories")
          return Response.json({
            total_count: visible.length,
            repositories: visible,
          });
        if (url.pathname === "/app/installations/500/access_tokens")
          return Response.json({ token: "read-only-installation-token" });
        if (url.pathname === "/installation/repositories")
          return Response.json({
            total_count: installed.length,
            repositories: installed,
          });
        throw new Error(`Unexpected test GitHub path: ${url.pathname}`);
      });
      vi.stubGlobal("fetch", fetcher);
      service = new GitHubService({ db });
      projects = new ProjectsService({ db });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    async function connect(target = actor) {
      const { state, url } = await service.begin(target, "githuborg");
      expect(new URL(url).searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      await service.complete(target.userId, state, "test-code");
    }

    it("consumes expiring OAuth state exactly once and binds it to WorkOS identity", async () => {
      const { state } = await service.begin(actor, "githuborg");
      await expect(
        service.consumeState(other.userId, state),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        (await service.consumeState(actor.userId, state)).organizationId,
      ).toBe(actor.organizationId);
      await expect(
        service.consumeState(actor.userId, state),
      ).rejects.toMatchObject({ status: 400 });
      const expired = await service.begin(actor, "githuborg");
      await client`UPDATE github_oauth_states SET expires_at = now() - interval '1 second'`;
      await expect(
        service.consumeState(actor.userId, expired.state),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("rechecks membership after OAuth, before GitHub exchange", async () => {
      const { state } = await service.begin(actor, "githuborg");
      workos.userManagement.deactivate(actor.organizationId, actor.userId);
      try {
        await expect(
          service.complete(actor.userId, state, "code"),
        ).rejects.toMatchObject({ status: 404 });
        expect(fetcher).not.toHaveBeenCalled();
      } finally {
        await workos.userManagement.createOrganizationMembership(actor);
      }
    });

    it("imports only user-accessible repositories and preserves existing project links", async () => {
      const manual = await projects.connectRepository(actor, {
        owner: "githuborg",
        name: "repo",
      });
      const project = await projects.create(actor, {
        name: "Project",
        description: "",
      });
      await projects.linkRepository(actor, project.id, manual.id);
      await connect();
      const status = await service.status(actor);
      expect(status.installations[0].repositories).toEqual([
        { id: manual.id, owner: "githuborg", name: "repo", available: true },
      ]);
      expect(
        await projects.listProjectRepositories(actor, project.id),
      ).toHaveLength(1);
      const [columns] =
        await client`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name LIKE 'github_%' AND column_name LIKE '%token%'`;
      expect(columns.count).toBe(0);
    });

    it("prevents cross-organization claims, reads and syncs", async () => {
      await connect();
      await expect(connect(other)).rejects.toMatchObject({ status: 409 });
      expect((await service.status(other)).installations).toEqual([]);
      await expect(
        service.status({ ...other, organizationId: actor.organizationId }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(service.sync(other, "500")).rejects.toMatchObject({
        status: 404,
      });
      const repo = (await service.status(actor)).installations[0]
        .repositories[0];
      await expect(
        client`UPDATE github_repository_access SET organization_id = ${other.organizationId} WHERE repository_id = ${repo.id}`,
      ).rejects.toMatchObject({ code: "23503" });
    });

    it("refreshes enrolled repositories without expanding access to hidden/new repositories", async () => {
      await connect();
      installed[0].name = "renamed";
      await service.sync(actor, "500");
      expect(
        (await service.status(actor)).installations[0].repositories.map(
          (row) => row.name,
        ),
      ).toEqual(["renamed"]);
      installed = [];
      await service.sync(actor, "500");
      expect(
        (await service.status(actor)).installations[0].repositories[0]
          .available,
      ).toBe(false);
    });

    it("does not restore repositories excluded by a narrower reconnection", async () => {
      visible = [...installed];
      await connect();
      expect(
        (await service.status(actor)).installations[0].repositories,
      ).toHaveLength(2);
      visible = [installed[0]];
      await connect();
      await service.sync(actor, "500");
      const repos = (await service.status(actor)).installations[0].repositories;
      expect(repos.find((repo) => repo.name === "hidden")?.available).toBe(
        false,
      );
      await service.webhook(
        randomUUID(),
        "push",
        webhookSchema.parse({
          installation: { id: 500 },
          repository: installed[1],
        }),
      );
      expect((await service.status(actor)).activity).toHaveLength(0);
    });

    it("deduplicates concurrent webhooks and preserves repository identity on rename", async () => {
      await connect();
      const before = (await service.status(actor)).installations[0]
        .repositories[0];
      const delivery = randomUUID();
      const payload = webhookSchema.parse({
        action: "renamed",
        installation: { id: 500 },
        repository: { ...visible[0], name: "renamed" },
      });
      await Promise.all([
        service.webhook(delivery, "repository", payload),
        service.webhook(delivery, "repository", payload),
      ]);
      const status = await service.status(actor);
      expect(status.activity).toHaveLength(1);
      expect(status.installations[0].repositories[0]).toMatchObject({
        id: before.id,
        name: "renamed",
      });
      await service.webhook(
        randomUUID(),
        "push",
        webhookSchema.parse({
          installation: { id: 500 },
          repository: installed[1],
        }),
      );
      expect((await service.status(actor)).activity).toHaveLength(1);
    });

    it("rolls back the delivery record if its repository update fails", async () => {
      await connect();
      await projects.connectRepository(actor, {
        owner: "githuborg",
        name: "collision",
      });
      const delivery = randomUUID();
      await expect(
        service.webhook(
          delivery,
          "repository",
          webhookSchema.parse({
            action: "renamed",
            installation: { id: 500 },
            repository: { ...visible[0], name: "collision" },
          }),
        ),
      ).rejects.toMatchObject({ cause: { code: "23505" } });
      expect((await service.status(actor)).activity).toHaveLength(0);
      await service.webhook(
        delivery,
        "repository",
        webhookSchema.parse({
          action: "renamed",
          installation: { id: 500 },
          repository: { ...visible[0], name: "renamed" },
        }),
      );
      expect((await service.status(actor)).activity).toHaveLength(1);
    });

    it("retains repository identity after uninstalling and reinstalling the app", async () => {
      await connect();
      const originalId = (await service.status(actor)).installations[0]
        .repositories[0].id;
      await service.webhook(
        randomUUID(),
        "installation",
        webhookSchema.parse({ action: "deleted", installation: { id: 500 } }),
      );
      const original = fetcher.getMockImplementation()!;
      fetcher.mockImplementation(async (input, init) => {
        if (new URL(String(input)).pathname === "/user/installations")
          return Response.json({
            total_count: 1,
            installations: [
              {
                id: 501,
                app_id: 42,
                account: { login: "GitHubOrg" },
                suspended_at: null,
              },
            ],
          });
        return original(String(input).replace("/501/", "/500/"), init);
      });
      await connect();
      const current = (await service.status(actor)).installations.find(
        (item) => item.id === "501",
      );
      expect(current?.repositories[0]).toMatchObject({
        id: originalId,
        available: true,
      });
    });

    it("handles removals and suspension without deleting history or automatically restoring access", async () => {
      await connect();
      await service.webhook(
        randomUUID(),
        "installation_repositories",
        webhookSchema.parse({
          action: "removed",
          installation: { id: 500 },
          repositories_removed: [{ id: 101 }],
        }),
      );
      expect(
        (await service.status(actor)).installations[0].repositories[0]
          .available,
      ).toBe(false);
      await service.webhook(
        randomUUID(),
        "installation",
        webhookSchema.parse({ action: "suspend", installation: { id: 500 } }),
      );
      expect((await service.status(actor)).installations[0].active).toBe(false);
      await expect(service.sync(actor, "500")).rejects.toMatchObject({
        status: 409,
      });
      await service.webhook(
        randomUUID(),
        "installation",
        webhookSchema.parse({ action: "unsuspend", installation: { id: 500 } }),
      );
      expect((await service.status(actor)).installations[0].active).toBe(false);
      await connect();
      expect((await service.status(actor)).installations[0]).toMatchObject({
        active: true,
        repositories: [{ available: true }],
      });
    });
  },
);
