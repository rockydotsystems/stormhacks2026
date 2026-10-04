import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fakeWorkOS } from "../../../../tests/workos";
import { FakeModel } from "@/features/planning/server/fake.model";
import { ProjectChatService } from "./project-chat.service";
import { ProjectChatController } from "./project-chat.controller";
import { searchProjectHistory } from "./search";
import { AuthService } from "@/features/auth/server/auth.service";
import type { ModelRequest } from "@/features/planning/server/model";
import type { ChatDetail } from "../contracts";

const workos = fakeWorkOS();
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  getWorkOS: () => workos,
}));
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => workos,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "private project chat with real Postgres",
  () => {
    const databaseName = `project_chat_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let service: ProjectChatService;
    let projectId: string;
    let otherProjectId: string;
    let documentId: string;
    let firstChangeId: string;
    let actor: { userId: string; organizationId: string };
    let teammate: typeof actor;
    let outsider: typeof actor;
    let chatId: string;
    let failModel = false;
    const model = new FakeModel({
      object: (request: ModelRequest) => {
        if (failModel) throw new Error("provider unavailable");
        const input = JSON.parse(request.messages.at(-1)!.content);
        if (!input.evidence)
          return {
            terms: input.question.includes("overview") ? [] : ["Postgres"],
          };
        const source = input.evidence.find(
          (item: { rationale: string | null }) =>
            item.rationale?.includes("concurrent writes"),
        );
        return {
          answer: `We chose Postgres for concurrent writes [${source.id}].`,
          sourceIds: [source.id],
        };
      },
    });

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
      const org = await workos.organizations.createOrganization({
        name: "Chat test",
      });
      const otherOrg = await workos.organizations.createOrganization({
        name: "Other org",
      });
      actor = { userId: `test-${randomUUID()}`, organizationId: org.id };
      teammate = { userId: `test-${randomUUID()}`, organizationId: org.id };
      outsider = { userId: actor.userId, organizationId: otherOrg.id };
      await workos.userManagement.createOrganizationMembership(actor);
      await workos.userManagement.createOrganizationMembership(teammate);
      await workos.userManagement.createOrganizationMembership(outsider);
      await client`insert into users (id) values (${actor.userId}), (${teammate.userId})`;
      await client`insert into organizations (id, name) values (${org.id}, 'Chat test'), (${otherOrg.id}, 'Other org')`;
      await client`insert into organization_members (organization_id, user_id) values (${org.id}, ${actor.userId}), (${org.id}, ${teammate.userId}), (${otherOrg.id}, ${actor.userId})`;
      const [project] =
        await client`insert into projects (organization_id, name) values (${org.id}, 'Test project') returning id`;
      const [other] =
        await client`insert into projects (organization_id, name) values (${org.id}, 'Other project') returning id`;
      projectId = project.id;
      otherProjectId = other.id;
      const [doc] =
        await client`insert into docs (organization_id, project_id) values (${org.id}, ${projectId}) returning id`;
      documentId = doc.id;
      const [first] =
        await client`insert into doc_changes (doc_id, title, content, created_by) values (${doc.id}, 'Storage', 'Use Postgres for concurrent writes.', ${actor.userId}) returning id`;
      firstChangeId = String(first.id);
      await client`insert into doc_versions (doc_id, change_id, published_by) values (${doc.id}, ${first.id}, ${actor.userId})`;
      await client`insert into doc_changes (doc_id, title, content, created_by) values (${doc.id}, 'Storage', 'Use a managed database instead.', ${actor.userId})`;
      const [conversation] =
        await client`insert into planning_conversations (user_id, organization_id, doc_id, title) values (${actor.userId}, ${org.id}, ${doc.id}, 'Storage') returning id`;
      const [question] =
        await client`insert into planning_messages (conversation_id, role, author_user_id, content) values (${conversation.id}, 'user', ${actor.userId}, 'We need concurrent writes; choose Postgres.') returning id`;
      const [answer] =
        await client`insert into planning_messages (conversation_id, role, content) values (${conversation.id}, 'assistant', 'Chose Postgres for concurrent writes.') returning id`;
      await client`insert into planning_change_sources (doc_id, change_id, conversation_id, trigger_message_id, result_message_id, range_start_message_id, range_end_message_id, mode) values (${doc.id}, ${first.id}, ${conversation.id}, ${question.id}, ${answer.id}, ${question.id}, ${answer.id}, 'generated')`;
      const [foreignDoc] =
        await client`insert into docs (organization_id, project_id) values (${org.id}, ${otherProjectId}) returning id`;
      await client`insert into doc_changes (doc_id, title, content, created_by) values (${foreignDoc.id}, 'Private other project', 'Postgres secret outside this project.', ${actor.userId})`;
      const [deleted] =
        await client`insert into docs (organization_id, project_id, deleted_at) values (${org.id}, ${projectId}, now()) returning id`;
      await client`insert into doc_changes (doc_id, title, content, created_by) values (${deleted.id}, 'Deleted', 'Postgres deleted secret.', ${actor.userId})`;
      service = new ProjectChatService({ db, model });
    });
    afterAll(async () => {
      if (client) await client.end();
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName}`);
        await admin.end();
      }
    });

    it("creates multiple private chats and rejects teammates, wrong projects, and wrong organizations", async () => {
      const chat = await service.create(actor, projectId, "New chat");
      chatId = chat.id;
      await service.create(actor, projectId, "Another chat");
      expect(await service.list(actor, projectId)).toHaveLength(2);
      expect(await service.list(teammate, projectId)).toEqual([]);
      await expect(
        service.get(teammate, projectId, chatId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.get(actor, otherProjectId, chatId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.get(outsider, projectId, chatId),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("retrieves old published snapshots, their reasons, and current state without leaking other projects or deleted docs", async () => {
      const evidence = await searchProjectHistory(
        drizzle(client),
        actor,
        projectId,
        ["Postgres"],
      );
      expect(evidence).toHaveLength(2);
      expect(evidence.every((item) => item.documentId === documentId)).toBe(
        true,
      );
      expect(
        evidence.find((item) => item.changeId === firstChangeId),
      ).toMatchObject({
        version: 1,
        isCurrent: false,
        href: `/documents/${documentId}?change=${firstChangeId}`,
      });
      expect(
        evidence.some((item) => item.rationale?.includes("concurrent writes")),
      ).toBe(true);
      expect(
        evidence.some(
          (item) =>
            item.isCurrent && item.previousContent?.includes("Postgres"),
        ),
      ).toBe(true);
      expect(
        await searchProjectHistory(drizzle(client), actor, projectId, [
          "unrecordedtechnology",
        ]),
      ).toEqual([]);
    });
    it("persists text and voice turns, deduplicates retries, and leaves every document/history/source unchanged", async () => {
      const before = await client`select * from doc_changes order by id`;
      const versions = await client`select * from doc_versions order by id`;
      const sources =
        await client`select * from planning_change_sources order by change_id`;
      const input = {
        content: "Why Postgres?",
        via: "text" as const,
        clientMessageId: randomUUID(),
      };
      const turn = await service.ask(actor, projectId, chatId, input);
      expect(turn.answer).toContain("concurrent writes");
      expect(turn.sources[0].changeId).toBe(firstChangeId);
      expect(await service.ask(actor, projectId, chatId, input)).toEqual(turn);
      await expect(
        service.ask(actor, projectId, chatId, {
          ...input,
          content: "Different question",
        }),
      ).rejects.toMatchObject({ status: 409 });
      await service.ask(actor, projectId, chatId, {
        ...input,
        clientMessageId: randomUUID(),
        via: "voice",
      });
      const reopened = await new ProjectChatService({
        db: drizzle(client),
        model,
      }).get(actor, projectId, chatId);
      expect(reopened.title).toBe(input.content);
      expect(reopened.turns.map((item) => item.via)).toEqual(["text", "voice"]);
      expect(await client`select * from doc_changes order by id`).toEqual(
        before,
      );
      expect(await client`select * from doc_versions order by id`).toEqual(
        versions,
      );
      expect(
        await client`select * from planning_change_sources order by change_id`,
      ).toEqual(sources);
      await expect(
        service.ask(teammate, projectId, chatId, {
          ...input,
          clientMessageId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("rejects concurrent turns and releases the lease after provider failure", async () => {
      await client`update project_chats set turn_token = ${randomUUID()}, turn_started_at = now() where id = ${chatId}`;
      const input = {
        content: "Why Postgres?",
        via: "text" as const,
        clientMessageId: randomUUID(),
      };
      await expect(
        service.ask(actor, projectId, chatId, input),
      ).rejects.toMatchObject({ status: 409 });
      await client`update project_chats set turn_token = null, turn_started_at = null where id = ${chatId}`;
      failModel = true;
      await expect(
        service.ask(actor, projectId, chatId, input),
      ).rejects.toThrow("provider unavailable");
      failModel = false;
      expect(
        (
          await client`select turn_token from project_chats where id = ${chatId}`
        )[0].turn_token,
      ).toBeNull();
      await service.ask(actor, projectId, chatId, input);
      expect((await service.get(actor, projectId, chatId)).turns).toHaveLength(
        3,
      );
    });
    it("enforces authentication and same-origin writes at the API controller", async () => {
      const controller = new ProjectChatController({
        authService: {
          requireUser: async () => ({ id: actor.userId }),
        } as AuthService,
        projectChatService: service,
      });
      const query = new URLSearchParams({
        organizationId: actor.organizationId,
        projectId,
      });
      const response = await controller.get(
        new Request(`https://app.test/api/project-chats/${chatId}?${query}`),
        chatId,
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(((await response.json()) as ChatDetail).turns).toHaveLength(3);
      await expect(
        controller.create(
          new Request("https://app.test/api/project-chats", {
            method: "POST",
            headers: {
              origin: "https://attacker.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              organizationId: actor.organizationId,
              projectId,
            }),
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      const anonymousAuth = new AuthService();
      vi.spyOn(anonymousAuth, "getSession").mockResolvedValue({
        configured: true,
        user: null,
      });
      const anonymous = new ProjectChatController({
        authService: anonymousAuth,
        projectChatService: service,
      });
      await expect(
        anonymous.list(
          new Request(`https://app.test/api/project-chats?${query}`),
        ),
      ).rejects.toMatchObject({ status: 401 });
    });
    it("reloads context after claiming a turn, including a reply completed between the initial read and claim", async () => {
      const originalGet = service.get.bind(service);
      const otherRequest = new ProjectChatService({
        db: drizzle(client),
        model,
      });
      const spy = vi
        .spyOn(service, "get")
        .mockImplementationOnce(async (...args) => {
          const stale = await originalGet(...args);
          await otherRequest.ask(actor, projectId, chatId, {
            content: "Interleaved question about Postgres",
            via: "text",
            clientMessageId: randomUUID(),
          });
          return stale;
        });
      try {
        await service.ask(actor, projectId, chatId, {
          content: "Why did we choose it?",
          via: "text",
          clientMessageId: randomUUID(),
        });
        const planInput = JSON.parse(
          model.requests.at(-2)!.messages.at(-1)!.content,
        );
        expect(planInput.recentTurns.at(-1).question).toBe(
          "Interleaved question about Postgres",
        );
      } finally {
        spy.mockRestore();
      }
    });
    it("revoked organization membership removes access even for the owner", async () => {
      workos.userManagement.deactivate(actor.organizationId, actor.userId);
      await expect(service.get(actor, projectId, chatId)).rejects.toMatchObject(
        { status: 404 },
      );
    });
  },
);
