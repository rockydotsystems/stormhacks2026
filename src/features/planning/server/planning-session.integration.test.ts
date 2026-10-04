import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { DocsService } from "@/features/docs/server/docs.service";
import { PlanningSessionService } from "@/features/planning/server/planning-session.service";
import { DrizzlePlanningSessionStore } from "@/features/planning/server/planning-session.store";
import {
  FakeRealtime,
  ScriptedAgent,
} from "@/features/planning/server/planning-session.testing";
import { WorkspaceContext } from "@/features/planning/server/workspace-context";

// Creates and drops only its own database; requires local CREATEDB privileges.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "planning session with real Postgres",
  () => {
    const databaseName = `planning_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let docs: DocsService;
    let store: DrizzlePlanningSessionStore;
    let context: WorkspaceContext;
    let created = false;

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 10 });
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
      docs = new DocsService({ db });
      store = new DrizzlePlanningSessionStore({ db });
      context = new WorkspaceContext({ db });
    });

    afterAll(async () => {
      try {
        if (client) await client.end();
        if (created) await admin.unsafe(`DROP DATABASE ${databaseName}`);
      } finally {
        if (admin) await admin.end();
      }
    });

    function build() {
      const agent = new ScriptedAgent();
      const service = new PlanningSessionService({
        planningSessionStore: store,
        docsService: docs,
        planningService: agent,
        workspaceContext: context,
        realtime: new FakeRealtime(),
        userDirectory: { displayName: async (id: string) => `Name of ${id}` },
      });
      return { agent, service };
    }

    const generate = {
      reply: "Here is the first draft.",
      phase: "generated" as const,
      mode: "generated" as const,
      document: { title: "Search ADR", content: "# Context\n\nFirst." },
    };
    const edit = (content: string) => ({
      reply: "Updated.",
      phase: "generated" as const,
      mode: "edited" as const,
      document: { title: "Search ADR", content },
    });
    const newUser = () => `test-${randomUUID()}`;

    it("provisions one personal organization per user even under concurrent first requests", async () => {
      const userId = newUser();
      const actors = await Promise.all(
        Array.from({ length: 6 }, () => context.resolveActor(userId)),
      );
      expect(new Set(actors.map((actor) => actor.organizationId)).size).toBe(1);
      const rows =
        await client`select count(*)::int as n from personal_workspaces where user_id = ${userId}`;
      expect(rows[0].n).toBe(1);
      const members =
        await client`select count(*)::int as n from organization_members where user_id = ${userId}`;
      expect(members[0].n).toBe(1);
    });

    it("isolates conversations and change sources between users", async () => {
      const { agent, service } = build();
      const a = newUser();
      const b = newUser();
      agent.enqueue(generate);
      const { id } = await service.createConversation(a, {
        projectName: "Private",
      });
      const sent = await service.sendMessage(a, id, { text: "draft it" });
      const changeId = sent.conversation.changes[0].id;
      await expect(service.getConversation(b, id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        service.getChangeSource(b, id, changeId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(service.publish(b, id)).rejects.toMatchObject({
        status: 404,
      });
      expect(await service.listConversations(b)).toEqual([]);
      expect((await service.listConversations(a)).map((row) => row.id)).toEqual(
        [id],
      );
    });

    it("attributes the conversation to the version that published it, and to the draft after", async () => {
      const { agent, service } = build();
      const userId = newUser();
      agent.enqueue({}, generate, edit("Second."), edit("Third."));
      const { id } = await service.createConversation(userId, {
        projectName: "History",
      });
      await service.sendMessage(userId, id, { text: "pitch" });
      await service.sendMessage(userId, id, { text: "that's enough" });
      await service.sendMessage(userId, id, { text: "tweak it" });
      await service.publish(userId, id);
      await service.sendMessage(userId, id, { text: "one more tweak" });

      const v1 = await service.getVersionSource(userId, id, 1);
      expect(v1.number).toBe(1);
      expect(v1.changes.map((change) => change.mode)).toEqual([
        "generated",
        "edited",
      ]);
      expect(v1.messages.map((message) => message.content)).toEqual([
        "pitch",
        "Noted.",
        "that's enough",
        "Here is the first draft.",
        "tweak it",
        "Updated.",
      ]);

      const draft = await service.getVersionSource(userId, id, null);
      expect(draft.number).toBeNull();
      expect(draft.changes.map((change) => change.mode)).toEqual(["edited"]);
      expect(draft.messages.map((message) => message.content)).toEqual([
        "one more tweak",
        "Updated.",
      ]);

      await expect(
        service.getVersionSource(userId, id, 2),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("generation, edit, publish and revert create the right changes, links and ranges", async () => {
      const { agent, service } = build();
      const userId = newUser();
      agent.enqueue({}, generate, edit("Second."));
      const { id } = await service.createConversation(userId, {
        projectName: "Flow",
      });
      await service.sendMessage(userId, id, { text: "pitch" });
      const generated = await service.sendMessage(userId, id, {
        text: "that's enough",
      });
      const first = generated.conversation.changes[0];
      expect(first.source?.mode).toBe("generated");
      const actor = await context.resolveActor(userId);
      const [project] = await client`SELECT * FROM projects WHERE id = ${id}`;
      expect(project).toMatchObject({
        organization_id: actor.organizationId,
        name: "Flow",
      });
      const [document] =
        await client`SELECT * FROM docs WHERE project_id = ${id}`;
      expect(document.organization_id).toBe(actor.organizationId);
      const firstSource = await service.getChangeSource(userId, id, first.id);
      expect(firstSource.messages.map((m) => m.role)).toEqual([
        "user",
        "assistant",
        "user",
        "assistant",
      ]);
      expect(BigInt(firstSource.range.endMessageId)).toBe(
        BigInt(firstSource.resultMessageId),
      );

      const edited = await service.sendMessage(userId, id, {
        text: "change it",
      });
      const second = edited.conversation.changes[1];
      const secondSource = await service.getChangeSource(userId, id, second.id);
      expect(secondSource.mode).toBe("edited");
      expect(secondSource.messages).toHaveLength(2);
      expect(BigInt(secondSource.range.startMessageId)).toBe(
        BigInt(firstSource.range.endMessageId) + BigInt(1),
      );

      const version = await service.publish(userId, id);
      expect(version.label).toBe("v1");
      const reverted = await service.revert(userId, id, {
        toChangeId: first.id,
      });
      expect(reverted.change.number).toBe(3);
      const revertSource = await service.getChangeSource(
        userId,
        id,
        reverted.change.id,
      );
      expect(revertSource).toMatchObject({
        mode: "reverted",
        revertedToChangeId: first.id,
      });
      expect(revertSource.triggerMessageId).toBe(reverted.userMessage.id);
      const detail = await service.getConversation(userId, id);
      expect(detail.workingDocument?.label).toBe("working, after v1");
      expect(detail.publishedDocument?.content).toBe("Second.");
    });

    it("a repeated clientMessageId does not duplicate the message, the agent run, or the change", async () => {
      const { agent, service } = build();
      const userId = newUser();
      agent.enqueue(generate);
      const { id } = await service.createConversation(userId, {
        projectName: "Idem",
      });
      const clientMessageId = randomUUID();
      const results = await Promise.allSettled([
        service.sendMessage(userId, id, { text: "draft", clientMessageId }),
        service.sendMessage(userId, id, { text: "draft", clientMessageId }),
      ]);
      // A racing duplicate may be told to retry (409). It never runs a second turn.
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      const again = await service.sendMessage(userId, id, {
        text: "draft",
        clientMessageId,
      });
      expect(agent.inputs).toHaveLength(1);
      expect(again.conversation.messages).toHaveLength(2);
      expect(again.conversation.changes).toHaveLength(1);
    });

    it("allows one turn at a time and lets an expired lease be taken over", async () => {
      const { agent, service } = build();
      const userId = newUser();
      const { id } = await service.createConversation(userId, {
        projectName: "Lease",
      });
      let release!: () => void;
      agent.gate = new Promise<void>((resolve) => (release = resolve));
      const running = service.sendMessage(userId, id, { text: "first" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await expect(
        service.sendMessage(userId, id, { text: "second" }),
      ).rejects.toMatchObject({
        status: 409,
      });
      release();
      await running;
      agent.gate = null;
      await client`update planning_conversations set turn_locked_at = now() where id = ${id}`;
      await expect(
        service.sendMessage(userId, id, { text: "blocked" }),
      ).rejects.toMatchObject({
        status: 409,
      });
      await client`update planning_conversations set turn_locked_at = now() - interval '10 minutes' where id = ${id}`;
      await expect(
        service.sendMessage(userId, id, { text: "takeover" }),
      ).resolves.toBeDefined();
    });

    it("rolls back the change, the message and the link together when the commit fails", async () => {
      const { service } = build();
      const userId = newUser();
      const { id } = await service.createConversation(userId, {
        projectName: "Atomic",
      });
      const actor = await context.resolveActor(userId);
      const { message } = await store.insertUserMessage(id, {
        authorUserId: userId,
        content: "draft",
        via: "text",
        clientMessageId: null,
      });
      await expect(
        store.commitTurn({
          conversationId: id,
          triggerMessageId: message.id,
          reply: "done",
          questions: [],
          phase: "generated",
          checklist: [],
          skillVersion: "x",
          mode: "generated",
          revertedToChangeId: null,
          applyDocument: async (txDocs) => {
            await txDocs.create(actor, id, {
              title: "Doomed",
              content: "text",
            });
            throw new Error("boom");
          },
        }),
      ).rejects.toThrow("boom");
      expect(
        await client`SELECT * FROM docs WHERE organization_id = ${actor.organizationId}`,
      ).toEqual([]);
      expect(
        await client`SELECT * FROM projects WHERE organization_id = ${actor.organizationId}`,
      ).toEqual([]);
      const detail = await service.getConversation(userId, id);
      expect(detail.messages.map((m) => m.role)).toEqual(["user"]);
      expect(detail.phase).toBe("grilling");
      expect(detail.workingDocument).toBeNull();
    });

    it("deleting a draft change cascades its link and keeps messages, and published history stays protected", async () => {
      const { agent, service } = build();
      const userId = newUser();
      agent.enqueue(generate, edit("Newer."));
      const { id } = await service.createConversation(userId, {
        projectName: "Cascade",
      });
      await service.sendMessage(userId, id, { text: "draft" });
      const edited = await service.sendMessage(userId, id, { text: "edit" });
      const [first, second] = edited.conversation.changes;
      const actor = await context.resolveActor(userId);
      const conversation = (await store.findConversation(
        userId,
        actor.organizationId,
        id,
      ))!;

      // Main's trigger and foreign key still reject deleting published history.
      await service.publish(userId, id, { changeId: first.id });
      await expect(
        docs.deleteChange(actor, conversation.docId!, first.id),
      ).rejects.toBeDefined();
      expect((await service.getChangeSource(userId, id, first.id)).mode).toBe(
        "generated",
      );

      // A later draft can be deleted. Its link goes with it. The messages stay.
      await docs.deleteChange(actor, conversation.docId!, second.id);
      await expect(
        service.getChangeSource(userId, id, second.id),
      ).rejects.toMatchObject({
        status: 404,
      });
      const detail = await service.getConversation(userId, id);
      expect(detail.changes).toHaveLength(1);
      expect(detail.messages).toHaveLength(4);
      const links =
        await client`select count(*)::int as n from planning_change_sources where conversation_id = ${id}`;
      expect(links[0].n).toBe(1);
    });

    it("lets participants, and only participants, open a conversation", async () => {
      const { service } = build();
      const owner = newUser();
      const teammate = newUser();
      const stranger = newUser();
      const { id } = await service.createConversation(owner, {
        projectName: "Shared",
      });
      const actor = await context.resolveActor(owner);
      await context.resolveActor(teammate);
      await context.resolveActor(stranger);

      expect(await store.findConversationForUser(teammate, id)).toBeNull();
      await store.addParticipant(id, {
        userId: teammate,
        displayName: "Ben K.",
      });
      expect((await store.findConversationForUser(teammate, id))?.id).toBe(id);
      expect(
        (await store.findConversation(teammate, actor.organizationId, id))?.id,
      ).toBe(id);
      expect(await store.findConversationForUser(stranger, id)).toBeNull();
      expect(
        (await store.listConversations(teammate, actor.organizationId)).map(
          (row) => row.id,
        ),
      ).toEqual([id]);

      const names = (await store.listParticipants(id)).map((row) => [
        row.userId,
        row.displayName,
      ]);
      expect(names).toEqual([
        [owner, "Name of " + owner],
        [teammate, "Ben K."],
      ]);
    });

    it("keeps a chosen name and fills only the empty placeholder", async () => {
      const { service } = build();
      const owner = newUser();
      const { id } = await service.createConversation(owner, {
        projectName: "Names",
      });
      await store.addParticipant(id, { userId: owner, displayName: "Other" });
      expect((await store.listParticipants(id))[0].displayName).toBe(
        "Name of " + owner,
      );
      await client`update planning_participants set display_name = '' where conversation_id = ${id}`;
      await store.addParticipant(id, { userId: owner, displayName: "Filled" });
      expect((await store.listParticipants(id))[0].displayName).toBe("Filled");
    });

    it("rejects a user message with no author and an agent message with one", async () => {
      const { service } = build();
      const owner = newUser();
      const { id } = await service.createConversation(owner, {
        projectName: "Authors",
      });
      await expect(
        client`insert into planning_messages (conversation_id, role, content) values (${id}, 'user', 'x')`,
      ).rejects.toMatchObject({
        constraint_name: "planning_messages_author_check",
      });
      await expect(
        client`insert into planning_messages (conversation_id, role, content, author_user_id) values (${id}, 'assistant', 'x', ${owner})`,
      ).rejects.toMatchObject({
        constraint_name: "planning_messages_author_check",
      });
    });
  },
);
