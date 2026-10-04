import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningSessionService } from "@/features/planning/server/planning-session.service";
import {
  FakeDocs,
  InMemoryStore,
  ScriptedAgent,
} from "@/features/planning/server/planning-session.testing";
import { sessionEventSchema } from "@/features/planning/session-contracts";
import type { SessionEvent } from "@/features/planning/session-contracts";

const draft = (title: string, content: string) => ({ title, content });
const generate = {
  reply: "Here is the first draft.",
  phase: "generated" as const,
  mode: "generated" as const,
  document: draft("Search ADR", "# Context\n\nFirst text."),
};
const edit = (content: string) => ({
  reply: "Updated.",
  phase: "generated" as const,
  mode: "edited" as const,
  document: draft("Search ADR", content),
});

function setup() {
  const docs = new FakeDocs();
  const store = new InMemoryStore(docs);
  docs.onChangeDeleted = (docId, changeId) =>
    store.cascadeDelete(docId, changeId);
  const agent = new ScriptedAgent();
  const service = new PlanningSessionService({
    planningSessionStore: store,
    docsService: docs,
    planningService: agent,
    workspaceContext: {
      resolveActor: async (userId: string) => ({
        userId,
        organizationId: `org-${userId}`,
      }),
    },
  });
  return { docs, store, agent, service };
}

async function collect(stream: AsyncIterable<SessionEvent>) {
  const events: SessionEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("PlanningSessionService", () => {
  let ctx: ReturnType<typeof setup>;
  let id: string;
  const user = "user-a";

  beforeEach(async () => {
    ctx = setup();
    id = (await ctx.service.createConversation(user, { projectName: "Search" }))
      .id;
  });

  it("persists a grilling turn without creating a document", async () => {
    ctx.agent.enqueue({
      reply: "Who searches?",
      questions: [{ text: "Who searches?", suggestion: "On-call engineers" }],
      checklist: [{ id: "pain", status: "covered", evidence: "waste time" }],
    });
    const result = await ctx.service.sendMessage(user, id, {
      text: "Incident search",
    });
    expect(result.conversation.workingDocument).toBeNull();
    expect(result.conversation.checklist).toHaveLength(1);
    expect(result.conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(result.assistantMessage.questions).toEqual([
      { text: "Who searches?", suggestion: "On-call engineers" },
    ]);
    expect(ctx.docs.calls).toEqual([]);
  });

  it("passes stored state to the agent, with the working and previous document", async () => {
    ctx.agent.enqueue({}, generate, edit("Second text."), {});
    await ctx.service.sendMessage(user, id, { text: "one" });
    await ctx.service.sendMessage(user, id, { text: "draft it" });
    await ctx.service.sendMessage(user, id, { text: "change it" });
    await ctx.service.sendMessage(user, id, { text: "thanks" });
    const last = ctx.agent.inputs.at(-1)!;
    expect(last.document?.content).toBe("Second text.");
    expect(last.previousDocument?.content).toBe("# Context\n\nFirst text.");
    expect(last.phase).toBe("generated");
    expect(last.messages.at(-1)).toEqual({ role: "user", content: "thanks" });
    expect(last.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("generation creates change 1 and a source covering the whole conversation so far", async () => {
    ctx.agent.enqueue({}, generate);
    await ctx.service.sendMessage(user, id, { text: "pitch" });
    const result = await ctx.service.sendMessage(user, id, {
      text: "that's enough",
    });
    const detail = result.conversation;
    expect(detail.changes).toHaveLength(1);
    expect(detail.workingDocument).toMatchObject({ number: 1, label: "v0" });
    const source = await ctx.service.getChangeSource(
      user,
      id,
      detail.changes[0].id,
    );
    expect(source).toMatchObject({
      mode: "generated",
      revertedToChangeId: null,
    });
    expect(source.range).toEqual({ startMessageId: "1", endMessageId: "4" });
    expect(source.triggerMessageId).toBe("3");
    expect(source.resultMessageId).toBe("4");
    expect(source.messages.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
    expect(detail.changes[0].source).toEqual({
      conversationId: id,
      triggerMessageId: "3",
      mode: "generated",
    });
    expect(detail.messages.find((m) => m.id === "4")?.producedChangeId).toBe(
      detail.changes[0].id,
    );
    expect(
      detail.messages.find((m) => m.id === "2")?.producedChangeId,
    ).toBeNull();
  });

  it("an edit adds change 2 whose source starts after the previous linked change", async () => {
    ctx.agent.enqueue(generate, {}, edit("Edited text."));
    await ctx.service.sendMessage(user, id, { text: "draft it" }); // 1,2
    await ctx.service.sendMessage(user, id, { text: "what is next?" }); // 3,4 no change
    const result = await ctx.service.sendMessage(user, id, {
      text: "make it shorter",
    }); // 5,6
    const changes = result.conversation.changes;
    expect(changes.map((c) => c.number)).toEqual([1, 2]);
    const source = await ctx.service.getChangeSource(user, id, changes[1].id);
    expect(source.mode).toBe("edited");
    expect(source.range).toEqual({ startMessageId: "3", endMessageId: "6" });
    expect(source.triggerMessageId).toBe("5");
    expect(source.messages.map((m) => m.content)).toContain("what is next?");
    expect(source.messages.map((m) => m.content)).not.toContain("draft it");
  });

  it("does not add a change when the agent returns the same document", async () => {
    ctx.agent.enqueue(generate, { ...generate, mode: "edited" });
    await ctx.service.sendMessage(user, id, { text: "draft" });
    const result = await ctx.service.sendMessage(user, id, { text: "again" });
    expect(result.conversation.changes).toHaveLength(1);
  });

  it("records an agent edit that restores the previous text as a revert", async () => {
    ctx.agent.enqueue(
      generate,
      edit("Worse text."),
      edit("# Context\n\nFirst text."),
    );
    await ctx.service.sendMessage(user, id, { text: "draft" });
    await ctx.service.sendMessage(user, id, { text: "rewrite" });
    const result = await ctx.service.sendMessage(user, id, {
      text: "undo that",
    });
    const [first, , third] = result.conversation.changes;
    const source = await ctx.service.getChangeSource(user, id, third.id);
    expect(source.mode).toBe("reverted");
    expect(source.revertedToChangeId).toBe(first.id);
  });

  it("revert appends a change, an exchange, and a source linked to the request", async () => {
    ctx.agent.enqueue(generate, edit("Newer text."));
    await ctx.service.sendMessage(user, id, { text: "draft" });
    const sent = await ctx.service.sendMessage(user, id, { text: "change" });
    const [first, second] = sent.conversation.changes;
    const reverted = await ctx.service.revert(user, id, {
      toChangeId: first.id,
    });
    expect(reverted.workingDocument.content).toBe("# Context\n\nFirst text.");
    expect(reverted.change.number).toBe(3);
    expect(reverted.change.source).toMatchObject({ mode: "reverted" });
    expect(reverted.userMessage.role).toBe("user");
    expect(reverted.assistantMessage.producedChangeId).toBe(reverted.change.id);
    const source = await ctx.service.getChangeSource(
      user,
      id,
      reverted.change.id,
    );
    expect(source.revertedToChangeId).toBe(first.id);
    expect(source.triggerMessageId).toBe(reverted.userMessage.id);
    const detail = await ctx.service.getConversation(user, id);
    expect(detail.changes).toHaveLength(3);
    // History is never rewritten: the newer text is still change 2.
    expect(detail.changes[1].id).toBe(second.id);
    await expect(
      ctx.service.revert(user, id, { toChangeId: reverted.change.id }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      ctx.service.revert(user, id, { toChangeId: "999" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("a repeated clientMessageId returns the stored outcome and does not run the agent again", async () => {
    ctx.agent.enqueue(generate);
    const clientMessageId = randomUUID();
    const first = await ctx.service.sendMessage(user, id, {
      text: "draft",
      clientMessageId,
    });
    const second = await ctx.service.sendMessage(user, id, {
      text: "draft",
      clientMessageId,
    });
    expect(ctx.agent.inputs).toHaveLength(1);
    expect(second.assistantMessage.id).toBe(first.assistantMessage.id);
    expect(second.conversation.messages).toHaveLength(2);
    expect(second.conversation.changes).toHaveLength(1);
    expect(ctx.docs.calls.filter((c) => c === "create")).toHaveLength(1);
  });

  it("retries a failed turn under the same clientMessageId without duplicating the user message", async () => {
    ctx.agent.enqueue({ fail: new Error("provider down") }, {});
    const clientMessageId = randomUUID();
    await expect(
      ctx.service.sendMessage(user, id, { text: "hello", clientMessageId }),
    ).rejects.toThrow("provider down");
    const retry = await ctx.service.sendMessage(user, id, {
      text: "hello",
      clientMessageId,
    });
    expect(retry.conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("rejects a concurrent turn with 409 and frees the lease afterwards", async () => {
    let release!: () => void;
    ctx.agent.gate = new Promise<void>((resolve) => (release = resolve));
    const running = ctx.service.sendMessage(user, id, { text: "first" });
    await vi.waitFor(() => expect(ctx.agent.inputs).toHaveLength(1));
    await expect(
      ctx.service.sendMessage(user, id, { text: "second" }),
    ).rejects.toMatchObject({ status: 409 });
    release();
    await running;
    ctx.agent.gate = null;
    await expect(
      ctx.service.sendMessage(user, id, { text: "third" }),
    ).resolves.toBeDefined();
    expect(ctx.store.isLeased(id)).toBe(false);
  });

  it("keeps the user message and records nothing else when the agent output is invalid", async () => {
    ctx.agent.enqueue({ reply: "   " });
    await expect(
      ctx.service.sendMessage(user, id, { text: "hi" }),
    ).rejects.toMatchObject({ status: 502 });
    const detail = await ctx.service.getConversation(user, id);
    expect(detail.messages.map((m) => m.role)).toEqual(["user"]);
    expect(ctx.store.isLeased(id)).toBe(false);
  });

  describe("streaming", () => {
    it("streams deltas, then document.changed, then message.final with ordered ids", async () => {
      ctx.agent.enqueue(generate);
      const events = await collect(
        ctx.service.streamMessage(user, id, { text: "draft" }),
      );
      for (const event of events)
        expect(() => sessionEventSchema.parse(event)).not.toThrow();
      const types = events.map((e) => e.type);
      expect(types.at(-1)).toBe("message.final");
      expect(types.at(-2)).toBe("document.changed");
      expect(types.filter((t) => t === "message.delta").length).toBeGreaterThan(
        1,
      );
      expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
      expect(events[0].id).toBe("1:1");
      const changed = events.find((e) => e.type === "document.changed");
      expect(changed).toMatchObject({
        workingDocument: { label: "v0" },
        change: { source: { mode: "generated" } },
      });
      const text = events
        .filter((e) => e.type === "message.delta")
        .map((e) => (e as { text: string }).text)
        .join("");
      expect(text).toBe(generate.reply);
    });

    it("keeps the user message, stores no assistant message, and emits an error event on failure", async () => {
      ctx.agent.enqueue({ fail: new Error("socket closed") });
      const events = await collect(
        ctx.service.streamMessage(user, id, { text: "draft" }),
      );
      expect(events.at(-1)).toMatchObject({ type: "error", code: "internal" });
      expect(JSON.stringify(events)).not.toContain("socket closed");
      const detail = await ctx.service.getConversation(user, id);
      expect(detail.messages.map((m) => m.role)).toEqual(["user"]);
      expect(detail.workingDocument).toBeNull();
      expect(ctx.store.isLeased(id)).toBe(false);
    });

    it("releases the lease when the consumer stops early", async () => {
      ctx.agent.enqueue(generate);
      const stream = ctx.service.streamMessage(user, id, { text: "draft" });
      await stream.next();
      await stream.return(undefined);
      expect(ctx.store.isLeased(id)).toBe(false);
      const detail = await ctx.service.getConversation(user, id);
      expect(detail.messages.map((m) => m.role)).toEqual(["user"]);
    });

    it("replays a stored outcome as a single final event for a repeated clientMessageId", async () => {
      ctx.agent.enqueue(generate);
      const clientMessageId = randomUUID();
      await ctx.service.sendMessage(user, id, {
        text: "draft",
        clientMessageId,
      });
      const events = await collect(
        ctx.service.streamMessage(user, id, { text: "draft", clientMessageId }),
      );
      expect(events.map((e) => e.type)).toEqual(["message.final"]);
      expect(ctx.agent.inputs).toHaveLength(1);
    });
  });

  describe("publishing", () => {
    it("a human publishes the working document as v1 and the label follows", async () => {
      ctx.agent.enqueue(generate, edit("Next text."));
      await ctx.service.sendMessage(user, id, { text: "draft" });
      const version = await ctx.service.publish(user, id);
      expect(version).toMatchObject({ number: 1, label: "v1" });
      let detail = await ctx.service.getConversation(user, id);
      expect(detail.workingDocument?.label).toBe("v1");
      expect(detail.publishedDocument).toMatchObject({
        number: 1,
        content: "# Context\n\nFirst text.",
      });
      expect(detail.changes[0].immutable).toBe(true);
      const sent = await ctx.service.sendMessage(user, id, { text: "edit" });
      detail = sent.conversation;
      expect(detail.workingDocument?.label).toBe("working, after v1");
      // The published document stays on v1 while the working document moves ahead.
      expect(detail.publishedDocument?.content).toBe(
        "# Context\n\nFirst text.",
      );
      await expect(
        ctx.service.publish(user, id, { changeId: detail.changes[0].id }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(ctx.service.publish(user, id)).resolves.toMatchObject({
        number: 2,
      });
    });

    it("has nothing to publish before the first document exists", async () => {
      await expect(ctx.service.publish(user, id)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("never publishes during a turn, and the agent port has no way to", async () => {
      ctx.agent.enqueue(generate, edit("More."));
      await ctx.service.sendMessage(user, id, { text: "draft" });
      await ctx.service.sendMessage(user, id, { text: "edit" });
      await collect(ctx.service.streamMessage(user, id, { text: "again" }));
      expect(ctx.docs.calls).not.toContain("publish");
      expect(
        Object.keys(Object.getPrototypeOf(ctx.agent)).sort(),
      ).not.toContain("publish");
      expect(
        (ctx.agent as unknown as Record<string, unknown>).publish,
      ).toBeUndefined();
    });
  });

  describe("change sources and deletion", () => {
    it("deleting a draft change removes its link but keeps the messages", async () => {
      ctx.agent.enqueue(generate, edit("Newer."));
      await ctx.service.sendMessage(user, id, { text: "draft" });
      const sent = await ctx.service.sendMessage(user, id, { text: "edit" });
      const [, second] = sent.conversation.changes;
      const actor = { userId: user, organizationId: `org-${user}` };
      const docId = (await ctx.store.findConversation(
        user,
        actor.organizationId,
        id,
      ))!.docId!;
      await ctx.docs.deleteChange(actor, docId, second.id);
      await expect(
        ctx.service.getChangeSource(user, id, second.id),
      ).rejects.toMatchObject({ status: 404 });
      const detail = await ctx.service.getConversation(user, id);
      expect(detail.changes).toHaveLength(1);
      expect(detail.messages).toHaveLength(4);
      expect(
        detail.messages.every((m) => m.producedChangeId !== second.id),
      ).toBe(true);
      const remaining = await ctx.service.getChangeSource(
        user,
        id,
        detail.changes[0].id,
      );
      expect(remaining.mode).toBe("generated");
    });

    it("shows voice turns by their transcript", async () => {
      ctx.agent.enqueue(generate);
      await ctx.service.sendMessage(user, id, {
        text: "we want incident search",
        via: "voice",
      });
      const result = await ctx.service.sendMessage(user, id, {
        text: "draft it",
      });
      const source = await ctx.service.getChangeSource(
        user,
        id,
        result.conversation.changes[0].id,
      );
      expect(source.messages[0]).toMatchObject({
        via: "voice",
        content: "we want incident search",
      });
    });
  });

  describe("ownership", () => {
    it("returns 404 for every method when the conversation belongs to someone else", async () => {
      ctx.agent.enqueue(generate);
      const sent = await ctx.service.sendMessage(user, id, { text: "draft" });
      const changeId = sent.conversation.changes[0].id;
      const other = "user-b";
      const notFound = { status: 404 };
      await expect(
        ctx.service.getConversation(other, id),
      ).rejects.toMatchObject(notFound);
      await expect(
        ctx.service.sendMessage(other, id, { text: "hi" }),
      ).rejects.toMatchObject(notFound);
      await expect(
        ctx.service.getChangeSource(other, id, changeId),
      ).rejects.toMatchObject(notFound);
      await expect(ctx.service.listChanges(other, id)).rejects.toMatchObject(
        notFound,
      );
      await expect(ctx.service.listVersions(other, id)).rejects.toMatchObject(
        notFound,
      );
      await expect(ctx.service.publish(other, id)).rejects.toMatchObject(
        notFound,
      );
      await expect(
        ctx.service.revert(other, id, { toChangeId: changeId }),
      ).rejects.toMatchObject(notFound);
      expect(await ctx.service.listConversations(other)).toEqual([]);
      expect(ctx.docs.calls.filter((c) => c === "publish")).toEqual([]);
    });
  });
});
