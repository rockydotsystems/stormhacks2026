import { randomUUID } from "node:crypto";
import type {
  DocChange,
  DocVersion,
  Snapshot,
} from "@/features/docs/contracts";
import type { OrganizationActor } from "@/features/organizations/contracts";
import type {
  AgentTurnInput,
  AgentTurnResult,
} from "@/features/planning/contracts";
import type {
  AgentPort,
  AgentStreamEvent,
} from "@/features/planning/server/planning-session.service";
import type {
  ChangeSourceRow,
  ConversationRow,
  DocsPort,
  MessageRow,
  ParticipantRow,
  PlanningSessionStore,
  CommitRevertInput,
  CommitTurnInput,
  AppliedChange,
} from "@/features/planning/server/planning-session.types";
import type {
  ChangeReason,
  Presence,
  RealtimePort,
} from "@/features/planning/server/realtime";
import { ApiError } from "@/server/errors";

// In-memory stand-ins for the data layer and the store. They follow the same rules the real
// ones enforce, so the session service's logic can be tested without a database.

type FakeChange = {
  id: number;
  title: string;
  content: string;
  createdBy: string;
  createdAt: Date;
};

export class FakeDocs implements DocsPort {
  private nextChangeId = 1;
  private docs = new Map<
    string,
    {
      organizationId: string;
      changes: FakeChange[];
      versions: {
        number: number;
        changeId: number;
        publishedBy: string;
        publishedAt: Date;
      }[];
    }
  >();
  readonly calls: string[] = [];
  onChangeDeleted: ((docId: string, changeId: string) => void) | null = null;

  private doc(actor: OrganizationActor, docId: string) {
    const doc = this.docs.get(docId);
    if (!doc || doc.organizationId !== actor.organizationId)
      throw new ApiError(404, "Doc not found.");
    return doc;
  }

  async create(actor: OrganizationActor, projectId: string, input: Snapshot) {
    this.calls.push("create");
    const id = randomUUID();
    this.docs.set(id, {
      organizationId: actor.organizationId,
      changes: [],
      versions: [],
    });
    await this.addChange(actor, id, input);
    return {
      id,
      organizationId: actor.organizationId,
      createdAt: new Date().toISOString(),
      projectId,
      description: "",
    };
  }

  async addChange(actor: OrganizationActor, docId: string, input: Snapshot) {
    this.calls.push("addChange");
    const doc = this.doc(actor, docId);
    const change: FakeChange = {
      id: this.nextChangeId++,
      title: input.title,
      content: input.content,
      createdBy: actor.userId,
      createdAt: new Date(),
    };
    doc.changes.push(change);
    return {
      id: String(change.id),
      docId,
      title: change.title,
      content: change.content,
      createdBy: change.createdBy,
      createdAt: change.createdAt.toISOString(),
      proposed: false,
    };
  }

  async listChanges(
    actor: OrganizationActor,
    docId: string,
  ): Promise<DocChange[]> {
    const doc = this.doc(actor, docId);
    const boundary = Math.max(0, ...doc.versions.map((v) => v.changeId));
    return doc.changes.map((change, index) => ({
      id: String(change.id),
      docId,
      title: change.title,
      content: change.content,
      createdBy: change.createdBy,
      createdAt: change.createdAt.toISOString(),
      number: index + 1,
      immutable: change.id <= boundary,
      proposed: false,
    }));
  }

  // Mirrors main: only a draft can be deleted, and the link table cascades.
  async deleteChange(
    actor: OrganizationActor,
    docId: string,
    changeId: string,
  ) {
    const doc = this.doc(actor, docId);
    const id = Number(changeId);
    const boundary = Math.max(0, ...doc.versions.map((v) => v.changeId));
    if (id <= boundary)
      throw new ApiError(409, "Published history cannot be deleted.");
    doc.changes = doc.changes.filter((change) => change.id !== id);
    this.onChangeDeleted?.(docId, changeId);
  }

  async publish(
    actor: OrganizationActor,
    docId: string,
    changeId: string,
  ): Promise<DocVersion> {
    this.calls.push("publish");
    const doc = this.doc(actor, docId);
    const id = Number(changeId);
    if (!doc.changes.some((change) => change.id === id))
      throw new ApiError(404, "Change not found.");
    const latest = doc.versions.at(-1);
    if (latest && id <= latest.changeId)
      throw new ApiError(409, "Publish a change after the latest version.");
    const version = {
      number: (latest?.number ?? 0) + 1,
      changeId: id,
      publishedBy: actor.userId,
      publishedAt: new Date(),
    };
    doc.versions.push(version);
    return this.versionDto(docId, version);
  }

  async listVersions(
    actor: OrganizationActor,
    docId: string,
  ): Promise<DocVersion[]> {
    return this.doc(actor, docId).versions.map((v) =>
      this.versionDto(docId, v),
    );
  }

  async getVersion(actor: OrganizationActor, docId: string, number: number) {
    const doc = this.doc(actor, docId);
    const version = doc.versions.find((v) => v.number === number);
    const change =
      version && doc.changes.find((c) => c.id === version.changeId);
    if (!version || !change) throw new ApiError(404, "Version not found.");
    return {
      ...this.versionDto(docId, version),
      title: change.title,
      content: change.content,
    };
  }

  private versionDto(
    docId: string,
    v: {
      number: number;
      changeId: number;
      publishedBy: string;
      publishedAt: Date;
    },
  ): DocVersion {
    return {
      id: randomUUID(),
      docId,
      changeId: String(v.changeId),
      number: v.number,
      label: `v${v.number}`,
      publishedBy: v.publishedBy,
      publishedAt: v.publishedAt.toISOString(),
    };
  }
}

export class InMemoryStore implements PlanningSessionStore {
  conversations = new Map<string, ConversationRow>();
  messages: MessageRow[] = [];
  sources: ChangeSourceRow[] = [];
  participants = new Map<string, Map<string, ParticipantRow>>();
  private leases = new Set<string>();
  private nextMessageId = 1;

  constructor(private readonly docs: DocsPort) {}

  private newMessage(
    conversationId: string,
    fields: Pick<
      MessageRow,
      | "role"
      | "authorUserId"
      | "content"
      | "via"
      | "questions"
      | "clientMessageId"
    >,
  ): MessageRow {
    const row: MessageRow = {
      id: String(this.nextMessageId++),
      conversationId,
      createdAt: new Date(),
      ...fields,
    };
    this.messages.push(row);
    return row;
  }

  // What the database cascade does when main deletes a draft change.
  cascadeDelete(docId: string, changeId: string) {
    this.sources = this.sources.filter(
      (row) => !(row.docId === docId && row.changeId === changeId),
    );
  }

  async createConversation(input: {
    userId: string;
    displayName: string;
    organizationId: string;
    title: string;
    docId?: string | null;
    phase?: ConversationRow["phase"];
  }) {
    const row: ConversationRow = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      title: input.title,
      docId: input.docId ?? null,
      phase: input.phase ?? "grilling",
      checklist: [],
      skillVersion: null,
      mode: "active",
      standbySinceMessageId: null,
      agreementStreak: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.set(row.id, row);
    await this.addParticipant(row.id, {
      userId: input.userId,
      displayName: input.displayName,
    });
    return { ...row };
  }

  private isParticipant(userId: string, conversationId: string) {
    return this.participants.get(conversationId)?.has(userId) ?? false;
  }

  async findConversationForUser(userId: string, id: string) {
    const row = this.conversations.get(id);
    return row && this.isParticipant(userId, id) ? { ...row } : null;
  }

  async findConversationById(id: string) {
    const row = this.conversations.get(id);
    return row ? { ...row } : null;
  }

  async findConversationByDoc(docId: string) {
    const row = [...this.conversations.values()].find(
      (item) => item.docId === docId,
    );
    return row ? { ...row } : null;
  }

  async addParticipant(
    conversationId: string,
    participant: { userId: string; displayName: string },
  ) {
    const members = this.participants.get(conversationId) ?? new Map();
    this.participants.set(conversationId, members);
    const existing: ParticipantRow | undefined = members.get(
      participant.userId,
    );
    if (!existing) {
      members.set(participant.userId, { ...participant, joinedAt: new Date() });
    } else if (existing.displayName === "") {
      existing.displayName = participant.displayName;
    }
    return { ...members.get(participant.userId)! };
  }

  async listParticipants(conversationId: string) {
    return [...(this.participants.get(conversationId)?.values() ?? [])].map(
      (row) => ({ ...row }),
    );
  }

  async findConversation(userId: string, organizationId: string, id: string) {
    const row = this.conversations.get(id);
    return row &&
      row.organizationId === organizationId &&
      this.isParticipant(userId, id)
      ? { ...row }
      : null;
  }

  async listConversations(userId: string, organizationId: string) {
    return [...this.conversations.values()]
      .filter(
        (row) =>
          row.organizationId === organizationId &&
          this.isParticipant(userId, row.id),
      )
      .map((row) => ({ ...row }));
  }

  async claimTurn(conversationId: string) {
    if (this.leases.has(conversationId)) return false;
    this.leases.add(conversationId);
    return true;
  }

  async releaseTurn(conversationId: string) {
    this.leases.delete(conversationId);
  }

  isLeased(conversationId: string) {
    return this.leases.has(conversationId);
  }

  async findMessageByClientId(conversationId: string, clientMessageId: string) {
    return (
      this.messages.find(
        (row) =>
          row.conversationId === conversationId &&
          row.clientMessageId === clientMessageId,
      ) ?? null
    );
  }

  async insertUserMessage(
    conversationId: string,
    input: {
      authorUserId: string;
      content: string;
      via: "text" | "voice";
      clientMessageId: string | null;
    },
  ) {
    if (input.clientMessageId) {
      const existing = await this.findMessageByClientId(
        conversationId,
        input.clientMessageId,
      );
      if (existing) return { message: existing, created: false };
    }
    return {
      message: this.newMessage(conversationId, {
        role: "user",
        questions: null,
        ...input,
      }),
      created: true,
    };
  }

  async findAssistantAfter(conversationId: string, messageId: string) {
    return (
      this.messages.find(
        (row) =>
          row.conversationId === conversationId &&
          row.role === "assistant" &&
          Number(row.id) > Number(messageId),
      ) ?? null
    );
  }

  async listMessages(conversationId: string, options?: { limit?: number }) {
    const rows = this.messages.filter(
      (row) => row.conversationId === conversationId,
    );
    return options?.limit ? rows.slice(-options.limit) : rows;
  }

  async listMessageRange(
    conversationId: string,
    startMessageId: string,
    endMessageId: string,
  ) {
    return this.messages.filter(
      (row) =>
        row.conversationId === conversationId &&
        Number(row.id) >= Number(startMessageId) &&
        Number(row.id) <= Number(endMessageId),
    );
  }

  async commitTurn(input: CommitTurnInput) {
    const conversation = this.conversations.get(input.conversationId)!;
    const change = input.applyDocument
      ? await input.applyDocument(this.docs)
      : null;
    conversation.phase = input.phase;
    conversation.checklist = input.checklist;
    conversation.skillVersion = input.skillVersion;
    conversation.updatedAt = new Date();
    if (change) conversation.docId ??= change.docId;
    const assistant = this.newMessage(conversation.id, {
      role: "assistant",
      authorUserId: null,
      content: input.reply,
      via: "text",
      questions: input.questions,
      clientMessageId: null,
    });
    if (change) {
      this.link(
        conversation.id,
        change,
        input.triggerMessageId,
        assistant.id,
        input.mode,
        input.revertedToChangeId,
      );
    }
    return { assistant, conversation: { ...conversation }, change };
  }

  async commitRevert(input: CommitRevertInput) {
    const conversation = this.conversations.get(input.conversationId)!;
    const userMessage = this.newMessage(conversation.id, {
      role: "user",
      authorUserId: input.authorUserId,
      content: input.requestText,
      via: "text",
      questions: null,
      clientMessageId: null,
    });
    const change = await input.applyDocument(this.docs);
    conversation.updatedAt = new Date();
    const assistant = this.newMessage(conversation.id, {
      role: "assistant",
      authorUserId: null,
      content: input.replyText,
      via: "text",
      questions: [],
      clientMessageId: null,
    });
    this.link(
      conversation.id,
      change,
      userMessage.id,
      assistant.id,
      "reverted",
      input.revertedToChangeId,
    );
    return {
      userMessage,
      assistant,
      change,
      conversation: { ...conversation },
    };
  }

  private link(
    conversationId: string,
    change: AppliedChange,
    triggerMessageId: string,
    resultMessageId: string,
    mode: ChangeSourceRow["mode"],
    revertedToChangeId: string | null,
  ) {
    const previousEnd = Math.max(
      0,
      ...this.sources
        .filter((row) => row.conversationId === conversationId)
        .map((row) => Number(row.rangeEndMessageId)),
    );
    const start = this.messages.find(
      (row) =>
        row.conversationId === conversationId && Number(row.id) > previousEnd,
    )!;
    this.sources.push({
      docId: change.docId,
      changeId: change.changeId,
      conversationId,
      triggerMessageId,
      resultMessageId,
      rangeStartMessageId: start.id,
      rangeEndMessageId: resultMessageId,
      mode,
      revertedToChangeId,
      createdAt: new Date(),
    });
  }

  async listChangeSources(conversationId: string) {
    return this.sources.filter((row) => row.conversationId === conversationId);
  }

  async findChangeSource(conversationId: string, changeId: string) {
    return (
      this.sources.find(
        (row) =>
          row.conversationId === conversationId && row.changeId === changeId,
      ) ?? null
    );
  }
}

type Script = Partial<AgentTurnResult> & {
  fail?: Error;
  failAfterDeltas?: boolean;
};

// A scripted agent. It only has runTurn and streamTurn, like the real port, so tests can show
// the agent has no way to publish.
export class ScriptedAgent implements AgentPort {
  readonly inputs: AgentTurnInput[] = [];
  gate: Promise<void> | null = null;
  private queue: Script[] = [];

  enqueue(...scripts: Script[]) {
    this.queue.push(...scripts);
    return this;
  }

  private next(input: AgentTurnInput): Script {
    this.inputs.push(input);
    return this.queue.shift() ?? {};
  }

  private result(script: Script): AgentTurnResult {
    return {
      reply: "Noted.",
      questions: [],
      checklist: [],
      phase: "grilling",
      document: null,
      skillVersion: "test-skill",
      mode: "grilling",
      ...script,
    };
  }

  async runTurn(input: AgentTurnInput) {
    const script = this.next(input);
    if (this.gate) await this.gate;
    if (script.fail) throw script.fail;
    return this.result(script);
  }

  async *streamTurn(input: AgentTurnInput): AsyncIterable<AgentStreamEvent> {
    const script = this.next(input);
    if (this.gate) await this.gate;
    const result = this.result(script);
    for (const text of result.reply.match(/.{1,6}/g) ?? []) {
      yield { type: "delta", text };
    }
    if (script.fail) throw script.fail;
    yield { type: "final", result };
  }
}

// Stands in for the live layer. Tests set who is present and read what was announced.
export class FakeRealtime implements RealtimePort {
  present = new Map<string, Presence[]>();
  notified: { conversationId: string; reason: ChangeReason }[] = [];
  failing = false;

  async presence(conversationId: string) {
    if (this.failing) throw new Error("realtime down");
    return this.present.get(conversationId) ?? [];
  }

  async notify(conversationId: string, reason: ChangeReason) {
    if (this.failing) throw new Error("realtime down");
    this.notified.push({ conversationId, reason });
  }

  setPresent(conversationId: string, ...userIds: string[]) {
    this.present.set(
      conversationId,
      userIds.map((userId) => ({ userId, displayName: `Name of ${userId}` })),
    );
  }
}
