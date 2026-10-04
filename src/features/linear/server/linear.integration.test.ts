import { randomUUID } from "node:crypto";
import {
  afterAll,
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
import { getWorkOS } from "@stormhacks/data/organizations/workos";
import type { SyncPlan } from "@stormhacks/data/linear/contracts";
import { linearConnections } from "@stormhacks/data/linear/schema";
import type { Database } from "@/server/db";
import { LinearService } from "./linear.service";
import { LinearRetryableError, type LinearClient } from "./linear.client";

type FakeIssue = {
  id: string;
  identifier: string;
  url: string;
  title: string;
  description: string | null;
  state: { name: string; type: string };
  parentId?: string;
};

class FakeLinear {
  issues = new Map<string, FakeIssue>();
  projects = new Map<string, { id: string; url: string; name: string }>();
  creates = 0;
  updates: string[] = [];
  failAfterCreates: number | null = null;
  async teams() {
    return [{ id: "team-1", name: "Core", key: "COR" }];
  }
  workspaceId = "lin-org";
  async workspace() {
    return { id: this.workspaceId, name: "Acme", urlKey: "acme" };
  }
  async project(_: string, id: string) {
    return this.projects.get(id) ?? null;
  }
  async createProject(_: string, input: { id: string; name: string }) {
    const project = {
      id: input.id,
      url: `https://linear.test/p/${input.id}`,
      name: input.name,
    };
    this.projects.set(input.id, project);
    return project;
  }
  async updateProject(_: string, id: string, input: { name: string }) {
    this.projects.get(id)!.name = input.name;
  }
  async issue(_: string, id: string) {
    return this.issues.get(id) ?? null;
  }
  async createIssue(
    _: string,
    input: {
      id: string;
      title: string;
      description: string;
      parentId?: string;
    },
  ) {
    if (this.failAfterCreates !== null && this.creates >= this.failAfterCreates)
      throw new LinearRetryableError(
        429,
        "Linear rate limit reached. Retry the sync shortly.",
      );
    this.creates++;
    const issue: FakeIssue = {
      id: input.id,
      identifier: `COR-${this.issues.size + 1}`,
      url: `https://linear.test/i/${input.id}`,
      title: input.title,
      description: input.description,
      state: { name: "Todo", type: "unstarted" },
      parentId: input.parentId,
    };
    this.issues.set(input.id, issue);
    return issue;
  }
  async updateIssue(
    _: string,
    id: string,
    input: { title: string; description: string },
  ) {
    this.updates.push(id);
    Object.assign(this.issues.get(id)!, input);
    return this.issues.get(id)!;
  }
  byTitle(title: string) {
    return [...this.issues.values()].find((issue) => issue.title === title)!;
  }
}

const planV1: SyncPlan = {
  summary: "Queue the work.",
  items: [
    {
      key: "use-queue",
      kind: "decision",
      title: "Use a queue",
      description: "Decision text",
      children: [
        { key: "add-worker", title: "Add worker", description: "w" },
        { key: "add-retries", title: "Add retries", description: "r" },
      ],
    },
    {
      key: "audit-log",
      kind: "requirement",
      title: "Write an audit log",
      description: "Req text",
      children: [],
    },
  ],
};

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Linear sync with real Postgres",
  () => {
    const databaseName = `linear_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let db: Database;
    let created = false;
    let docs: DocsService;
    let projects: ProjectsService;
    let fake: FakeLinear;
    let service: LinearService;
    let plan: SyncPlan;
    const tokens = { get: vi.fn() };
    const generateObject = vi.fn();
    let adminActor: { userId: string; organizationId: string };
    let editor: typeof adminActor;
    let docId: string;

    async function publishNew(content: string) {
      const change = await docs.addChange(adminActor, docId, {
        title: "Queue ADR",
        content,
      });
      return docs.publish(adminActor, docId, change.id);
    }

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 8 });
      db = drizzle(client);
      await migrate(db, { migrationsFolder: "drizzle" });
      docs = new DocsService({ db });
      projects = new ProjectsService({ db });
      const organization = await new OrganizationsService({ db }).create(
        "lin-admin",
        "Linear test",
      );
      adminActor = { userId: "lin-admin", organizationId: organization.id };
      editor = { userId: "lin-editor", organizationId: organization.id };
      await getWorkOS().userManagement.createOrganizationMembership({
        organizationId: organization.id,
        userId: editor.userId,
        roleSlug: "member",
      });
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
      vi.stubEnv(
        "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
        "https://app.test/callback",
      );
      for (const table of [
        "linear_issue_links",
        "linear_syncs",
        "linear_doc_links",
        "linear_project_links",
        "linear_connections",
      ])
        await client.unsafe(`DELETE FROM ${table}`);
      fake = new FakeLinear();
      plan = structuredClone(planV1);
      tokens.get.mockReset().mockResolvedValue("lin_token");
      generateObject.mockReset().mockImplementation(async () => plan);
      service = new LinearService(
        { db, docsService: docs, model: { generateObject } as never },
        fake as unknown as LinearClient,
        tokens,
      );
      await db.insert(linearConnections).values({
        organizationId: adminActor.organizationId,
        linearOrganizationId: "lin-org",
        linearOrganizationName: "Acme",
        linearUrlKey: "acme",
        connectedBy: adminActor.userId,
      });
      const project = await projects.create(adminActor, {
        name: `Project ${randomUUID()}`,
      });
      const doc = await docs.create(adminActor, project.id, {
        title: "Queue ADR",
        content: "# Queue\nOriginal",
      });
      docId = doc.id;
      const [first] = await docs.listChanges(adminActor, docId);
      await docs.publish(adminActor, docId, first.id);
    });

    it("lets only admins connect or disconnect, and syncs use the connecting admin's token", async () => {
      await expect(service.connect(editor)).rejects.toMatchObject({
        status: 403,
      });
      await expect(service.disconnect(editor)).rejects.toMatchObject({
        status: 403,
      });
      expect(tokens.get).not.toHaveBeenCalled();
      await service.connect(adminActor);
      expect(tokens.get).toHaveBeenCalledWith(
        adminActor.userId,
        adminActor.organizationId,
      );
      expect(await service.status(editor)).toMatchObject({
        isAdmin: false,
        connection: { linearOrganizationName: "Acme" },
      });
      // An editor syncs with the admin's connection, not their own.
      tokens.get.mockClear();
      await service.sync(editor, docId, { teamId: "team-1" });
      expect(tokens.get).toHaveBeenCalled();
      for (const call of tokens.get.mock.calls)
        expect(call[0]).toBe(adminActor.userId);
      await service.disconnect(adminActor);
      expect((await service.status(adminActor)).connection).toBeNull();
      await expect(
        service.sync(adminActor, docId, { teamId: "team-1" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("surfaces a lost Pipes connection and does not start a run", async () => {
      tokens.get.mockRejectedValue(
        Object.assign(new Error("needs auth"), { status: 409 }),
      );
      await expect(
        service.sync(adminActor, docId, { teamId: "team-1" }),
      ).rejects.toThrow("needs auth");
      expect(await client`SELECT 1 FROM linear_syncs`).toHaveLength(0);
    });

    it("clears team, project, and issue links only when a different Linear workspace is connected", async () => {
      await service.sync(adminActor, docId, { teamId: "team-1" });
      await service.connect(adminActor); // same workspace keeps links
      expect(
        (await service.documentStatus(adminActor, docId)).projectUrl,
      ).not.toBeNull();
      fake.workspaceId = "lin-other";
      await service.connect(adminActor);
      const status = await service.documentStatus(adminActor, docId);
      expect(status.projectUrl).toBeNull();
      expect(status.team).toBeNull();
      expect(await client`SELECT 1 FROM linear_issue_links`).toHaveLength(0);
    });

    it("maps the document to a project and decisions to issues with sub-issues, run by a non-admin editor", async () => {
      await expect(service.sync(editor, docId, {})).rejects.toMatchObject({
        status: 400,
      });
      const result = await service.sync(editor, docId, { teamId: "team-1" });
      expect(result).toMatchObject({ created: 4, updated: 0, skipped: 0 });
      expect(result.sync).toMatchObject({
        status: "completed",
        completed: 4,
        total: 4,
      });
      expect(fake.projects.size).toBe(1);
      expect([...fake.projects.values()][0].name).toBe("Queue ADR");
      const parent = fake.byTitle("Use a queue");
      expect(fake.byTitle("Add worker").parentId).toBe(parent.id);
      expect(fake.byTitle("Add retries").parentId).toBe(parent.id);
      expect(fake.byTitle("Write an audit log").parentId).toBeUndefined();
      // The team is remembered for the whole project, so the next sync needs no team.
      const status = await service.documentStatus(editor, docId);
      expect(status.team).toMatchObject({ key: "COR" });
      expect(status.projectUrl).toBe(result.projectUrl);
    });

    it("refuses documents that are not published", async () => {
      const project = await projects.create(adminActor, {
        name: `Draft ${randomUUID()}`,
      });
      const draft = await docs.create(adminActor, project.id, {
        title: "Draft",
        content: "x",
      });
      await expect(
        service.sync(adminActor, draft.id, { teamId: "team-1" }),
      ).rejects.toMatchObject({
        status: 409,
      });
      expect(generateObject).not.toHaveBeenCalled();
    });

    it("on republish updates open tickets, preserves review and completed ones, and leaves removed requirements alone", async () => {
      await service.sync(adminActor, docId, { teamId: "team-1" });
      fake.byTitle("Use a queue").state = {
        name: "In Review",
        type: "started",
      };
      fake.byTitle("Add worker").state = { name: "Done", type: "completed" };
      fake.byTitle("Add retries").state = {
        name: "In Progress",
        type: "started",
      };
      fake.updates = [];
      await publishNew("# Queue\nRevised");
      plan = {
        summary: "Revised.",
        items: [
          {
            ...planV1.items[0],
            description: "Changed decision text",
            children: [
              {
                key: "add-worker",
                title: "Add worker (renamed)",
                description: "w2",
              },
              { key: "add-retries", title: "Add retries", description: "r2" },
              { key: "add-metrics", title: "Add metrics", description: "m" },
            ],
          },
          // "audit-log" was removed from the document.
        ],
      };
      const result = await service.sync(adminActor, docId, {});
      expect(result).toMatchObject({ created: 1, updated: 1, skipped: 2 });
      expect(fake.byTitle("Use a queue").description).not.toContain("Changed");
      expect(fake.byTitle("Add worker")).toBeDefined();
      expect(fake.issues.size).toBe(5);
      expect(fake.byTitle("Add retries").description).toContain("r2");
      expect(fake.byTitle("Add metrics").parentId).toBe(
        fake.byTitle("Use a queue").id,
      );
      expect(fake.byTitle("Write an audit log").description).toContain(
        "Req text",
      );
      expect(fake.updates).toHaveLength(1);
      // The extraction was told which items already exist, to keep keys stable.
      const sent = JSON.parse(
        generateObject.mock.calls.at(-1)![0].messages[0].content,
      );
      expect(
        sent.existingItems.map((item: { key: string }) => item.key),
      ).toContain("audit-log");
    });

    it("saves progress when Linear fails midway, and a retry finishes without duplicates or re-extraction", async () => {
      fake.failAfterCreates = 2;
      const failed = await service.sync(adminActor, docId, {
        teamId: "team-1",
      });
      expect(failed.sync).toMatchObject({
        status: "failed",
        completed: 2,
        total: 4,
      });
      expect(failed.sync.error).toMatch(/rate limit/i);
      expect(fake.issues.size).toBe(2);
      expect(
        (await service.documentStatus(adminActor, docId)).lastSync?.status,
      ).toBe("failed");

      fake.failAfterCreates = null;
      const retried = await service.sync(adminActor, docId, {});
      expect(retried.sync).toMatchObject({
        status: "completed",
        completed: 4,
        id: failed.sync.id,
      });
      expect(retried.created).toBe(2);
      expect(fake.creates).toBe(4);
      expect(fake.issues.size).toBe(4);
      expect(generateObject).toHaveBeenCalledTimes(1);
      const done = (await service.documentStatus(adminActor, docId)).lastSync!;
      expect(done.items!.every((item) => item.state === "synced")).toBe(true);
    });

    it("does not duplicate an issue Linear already created before the crash", async () => {
      fake.failAfterCreates = 1;
      await service.sync(adminActor, docId, { teamId: "team-1" });
      // Simulate a created issue whose progress was never saved.
      await client`UPDATE linear_syncs SET completed_keys = '[]'::jsonb`;
      fake.failAfterCreates = null;
      const result = await service.sync(adminActor, docId, {});
      expect(fake.issues.size).toBe(4);
      expect(result.sync.status).toBe("completed");
      expect(fake.creates).toBe(4);
    });

    it("rejects a second run while one holds the lease, and recovers an expired lease", async () => {
      const [version] =
        await client`SELECT id FROM doc_versions WHERE doc_id = ${docId}`;
      await client`INSERT INTO linear_syncs(organization_id, doc_id, version_id, requested_by, lease_until)
        VALUES (${adminActor.organizationId}, ${docId}, ${version.id}, 'lin-admin', now() + interval '5 minutes')`;
      await expect(
        service.sync(adminActor, docId, { teamId: "team-1" }),
      ).rejects.toMatchObject({
        status: 409,
      });
      await client`UPDATE linear_syncs SET lease_until = now() - interval '1 minute'`;
      const result = await service.sync(adminActor, docId, {});
      expect(result.sync.status).toBe("completed");
    });
  },
);
