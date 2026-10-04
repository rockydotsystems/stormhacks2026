import "server-only";
import { z, ZodError } from "zod";
import { changeIdSchema } from "@/features/docs/contracts";
import type { DocChange, DocVersion } from "@/features/docs/contracts";
import {
  checklistEntrySchema,
  documentDraftSchema,
  phaseSchema,
  questionSchema,
  type AgentTurnInput,
  type AgentTurnResult,
  type DocumentDraft,
} from "@/features/planning/contracts";
import { ModelError } from "@/features/planning/server/model";
import type {
  ApplyDocument,
  ChangeSourceRow,
  ConversationRow,
  DocsPort,
  MessageRow,
  PlanningSessionStore,
} from "@/features/planning/server/planning-session.types";
import type {
  ChangeReason,
  RealtimePort,
} from "@/features/planning/server/realtime";
import type { UserDirectory } from "@/features/planning/server/user-directory";
import type { ActorResolver } from "@/features/planning/server/workspace-context";
import {
  createConversationSchema,
  publishSchema,
  revertSchema,
  sendMessageSchema,
  type ChangeMode,
  type ChangeSourceDetail,
  type VersionSource,
  type ChangeSummary,
  type ConversationDetail,
  type ConversationListItem,
  type CreateConversationInput,
  type MessageDto,
  type ParticipantDto,
  type PublishInput,
  type RevertInput,
  type RevertResult,
  type SendMessageInput,
  type SendMessageResult,
  type SessionEvent,
  type VersionDetail,
  type VersionSummary,
  type WorkingDocumentDto,
} from "@/features/planning/session-contracts";
import { ApiError } from "@/server/errors";
import type { OrganizationActor } from "@/features/organizations/contracts";

// The agent as the session service sees it. It can run a turn and nothing else: no publish, no
// doc access. The real PlanningService satisfies this shape.
export type AgentStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "final"; result: AgentTurnResult };

export interface AgentPort {
  runTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
  streamTurn(input: AgentTurnInput): AsyncIterable<AgentStreamEvent>;
}

// A turn holds its lease for at most this long, then another turn may take over. This keeps a
// crashed worker from wedging a conversation, without holding a database transaction open
// while the model runs.
const LEASE_SECONDS = 120;
const HISTORY_LIMIT = 100;

const agentResultSchema = z.object({
  reply: z.string().trim().min(1),
  questions: z.array(questionSchema),
  checklist: z.array(checklistEntrySchema),
  phase: phaseSchema,
  document: documentDraftSchema.nullable(),
  skillVersion: z.string().min(1),
  mode: z.enum(["grilling", "confirming", "generated", "edited"]),
});

type Draft = { changeId: string; title: string; content: string };

type PreparedRun = {
  kind: "run";
  actor: OrganizationActor;
  conversation: ConversationRow;
  userMessage: MessageRow;
  input: AgentTurnInput;
  working: Draft | null;
  previous: Draft | null;
  release: () => Promise<void>;
};

type PreparedDuplicate = {
  kind: "duplicate";
  actor: OrganizationActor;
  conversation: ConversationRow;
  userMessage: MessageRow;
  assistantMessage: MessageRow;
};

type Prepared = PreparedRun | PreparedDuplicate;

type Committed = {
  assistant: MessageRow;
  conversation: ConversationRow;
  changeId: string | null;
};

const iso = (date: Date) => date.toISOString();

function sameDocument(a: DocumentDraft, b: DocumentDraft) {
  return a.title === b.title && a.content === b.content;
}

function messageDto(row: MessageRow, producedChangeId: string | null) {
  return {
    id: row.id,
    role: row.role,
    authorUserId: row.authorUserId,
    content: row.content,
    via: row.via,
    questions: row.questions,
    createdAt: iso(row.createdAt),
    producedChangeId,
  } satisfies MessageDto;
}

function listItem(row: ConversationRow): ConversationListItem {
  return {
    id: row.id,
    title: row.title,
    phase: row.phase,
    hasDocument: row.docId !== null,
    documentId: row.docId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function workingLabel(working: DocChange, latest: DocVersion | undefined) {
  if (!latest) return "v0";
  return working.id === latest.changeId
    ? `v${latest.number}`
    : `working, after v${latest.number}`;
}

function changeSummary(
  change: DocChange,
  source: ChangeSourceRow | undefined,
): ChangeSummary {
  return {
    id: change.id,
    number: change.number,
    title: change.title,
    createdBy: change.createdBy,
    createdAt: change.createdAt,
    immutable: change.immutable,
    source: source
      ? {
          conversationId: source.conversationId,
          triggerMessageId: source.triggerMessageId,
          mode: source.mode,
        }
      : null,
  };
}

function versionSummary(version: DocVersion): VersionSummary {
  return {
    number: version.number,
    label: version.label,
    changeId: version.changeId,
    publishedBy: version.publishedBy,
    publishedAt: version.publishedAt,
  };
}

type ErrorCode = Extract<SessionEvent, { type: "error" }>["code"];

function errorEvent(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return { code: "conflict", message: error.message };
    if (error.status === 404)
      return { code: "not_found", message: error.message };
    if (error.status === 502)
      return {
        code: "invalid_output",
        message: "The planning agent returned an invalid response.",
      };
  }
  if (error instanceof ModelError) {
    return error.kind === "invalid-output"
      ? {
          code: "invalid_output",
          message: "The planning agent returned an invalid response.",
        }
      : { code: "agent_failed", message: "The planning agent is unavailable." };
  }
  return { code: "internal", message: "Something went wrong." };
}

export class PlanningSessionService {
  constructor(
    private readonly dependencies: {
      planningSessionStore: PlanningSessionStore;
      docsService: DocsPort;
      planningService: AgentPort;
      workspaceContext: ActorResolver;
      userDirectory: UserDirectory;
      realtime: RealtimePort;
    },
  ) {}

  private get store() {
    return this.dependencies.planningSessionStore;
  }

  // Tells everyone in the chat to refetch. A failure here must never fail the request, because
  // the change is already saved and every client sees it on its next fetch.
  private async announce(conversationId: string, reason: ChangeReason) {
    try {
      await this.dependencies.realtime.notify(conversationId, reason);
    } catch (error) {
      console.error("Announcing a change failed", error);
    }
  }

  private get docs() {
    return this.dependencies.docsService;
  }

  // Every method starts here. A conversation another user owns is a 404, never a 403.
  // The conversation's own organization decides what the user acts as. A conversation bound to
  // a document lives in the document's organization, which may not be the personal one.
  private async load(userId: string, id: string) {
    const conversation = await this.store.findConversationForUser(userId, id);
    if (!conversation) throw new ApiError(404, "Conversation not found.");
    const actor: OrganizationActor = {
      userId,
      organizationId: conversation.organizationId,
    };
    return { actor, conversation };
  }

  // Who the live layer should admit to this conversation's room, and under what name.
  async liveAccess(userId: string, id: string): Promise<ParticipantDto> {
    const { actor, conversation } = await this.load(userId, id);
    const participants = await this.participantsFor(
      actor.userId,
      conversation.id,
    );
    const me = participants.find((row) => row.userId === userId);
    if (!me) throw new ApiError(404, "Conversation not found.");
    return { userId: me.userId, displayName: me.displayName };
  }

  async createConversation(
    userId: string,
    input: CreateConversationInput,
  ): Promise<ConversationDetail> {
    const parsed = createConversationSchema.parse(input);
    if (parsed.documentId && parsed.organizationId) {
      return this.bindToDocument(userId, {
        title: parsed.projectName,
        documentId: parsed.documentId,
        organizationId: parsed.organizationId,
      });
    }
    const actor = await this.dependencies.workspaceContext.resolveActor(userId);
    const conversation = await this.store.createConversation({
      userId,
      displayName: await this.dependencies.userDirectory.displayName(userId),
      organizationId: actor.organizationId,
      title: parsed.projectName,
    });
    return this.detail(actor, conversation);
  }

  // Plans a document that already exists. The docs layer checks that the user belongs to the
  // organization and that the document is in it. One conversation plans one document, so asking
  // again returns the same conversation. A teammate who opens the document of a conversation
  // someone else started joins that conversation, so everyone shares one chat and one agent.
  private async bindToDocument(
    userId: string,
    input: { title: string; documentId: string; organizationId: string },
  ): Promise<ConversationDetail> {
    const actor: OrganizationActor = {
      userId,
      organizationId: input.organizationId,
    };
    const changes = await this.docs.listChanges(actor, input.documentId);
    const existing = await this.store.findConversationByDoc(input.documentId);
    if (existing) {
      await this.store.addParticipant(existing.id, {
        userId,
        displayName: await this.dependencies.userDirectory.displayName(userId),
      });
      await this.announce(existing.id, "participants");
      return this.detail(actor, existing);
    }
    const hasText = Boolean(changes.at(-1)?.content.trim());
    const conversation = await this.store.createConversation({
      userId,
      displayName: await this.dependencies.userDirectory.displayName(userId),
      organizationId: input.organizationId,
      title: input.title,
      docId: input.documentId,
      phase: hasText ? "generated" : "grilling",
    });
    return this.detail(actor, conversation);
  }

  async listConversations(userId: string): Promise<ConversationListItem[]> {
    const actor = await this.dependencies.workspaceContext.resolveActor(userId);
    const rows = await this.store.listConversations(
      userId,
      actor.organizationId,
    );
    return rows.map(listItem);
  }

  async getConversation(
    userId: string,
    id: string,
  ): Promise<ConversationDetail> {
    const { actor, conversation } = await this.load(userId, id);
    return this.detail(actor, conversation);
  }

  async listChanges(userId: string, id: string): Promise<ChangeSummary[]> {
    const { actor, conversation } = await this.load(userId, id);
    if (!conversation.docId) return [];
    const [changes, sources] = await Promise.all([
      this.docs.listChanges(actor, conversation.docId),
      this.store.listChangeSources(conversation.id),
    ]);
    const byChange = new Map(sources.map((row) => [row.changeId, row]));
    return changes.map((change) =>
      changeSummary(change, byChange.get(change.id)),
    );
  }

  async listVersions(userId: string, id: string): Promise<VersionSummary[]> {
    const { actor, conversation } = await this.load(userId, id);
    if (!conversation.docId) return [];
    const versions = await this.docs.listVersions(actor, conversation.docId);
    return versions.map(versionSummary);
  }

  async getVersion(
    userId: string,
    id: string,
    number: number,
  ): Promise<VersionDetail> {
    const { actor, conversation } = await this.load(userId, id);
    if (!conversation.docId) throw new ApiError(404, "Version not found.");
    const version = await this.docs.getVersion(
      actor,
      conversation.docId,
      number,
    );
    return {
      ...versionSummary(version),
      title: version.title,
      content: version.content,
    };
  }

  // The conversation segment behind one change, with full messages. Voice turns show their transcript.
  async getChangeSource(
    userId: string,
    id: string,
    changeId: string,
  ): Promise<ChangeSourceDetail> {
    const parsedId = changeIdSchema.parse(changeId);
    const { conversation } = await this.load(userId, id);
    const source = await this.store.findChangeSource(conversation.id, parsedId);
    if (!source)
      throw new ApiError(404, "No conversation recorded for that change.");
    const [messages, sources] = await Promise.all([
      this.store.listMessageRange(
        conversation.id,
        source.rangeStartMessageId,
        source.rangeEndMessageId,
      ),
      this.store.listChangeSources(conversation.id),
    ]);
    const produced = new Map(
      sources.map((row) => [row.resultMessageId, row.changeId]),
    );
    return {
      conversationId: conversation.id,
      changeId: source.changeId,
      mode: source.mode,
      triggerMessageId: source.triggerMessageId,
      resultMessageId: source.resultMessageId,
      revertedToChangeId: source.revertedToChangeId,
      range: {
        startMessageId: source.rangeStartMessageId,
        endMessageId: source.rangeEndMessageId,
      },
      messages: messages.map((row) =>
        messageDto(row, produced.get(row.id) ?? null),
      ),
    };
  }

  // The conversation behind one version, or behind the draft when `number` is null. A version
  // owns the changes after the previous version up to its own change. The draft owns the rest.
  async getVersionSource(
    userId: string,
    id: string,
    number: number | null,
  ): Promise<VersionSource> {
    const { actor, conversation } = await this.load(userId, id);
    if (!conversation.docId) throw new ApiError(404, "Version not found.");
    const versions = await this.docs.listVersions(actor, conversation.docId);
    let lower = BigInt(0);
    let upper: bigint | null = null;
    if (number === null) {
      const latest = versions.at(-1);
      if (latest) lower = BigInt(latest.changeId);
    } else {
      const index = versions.findIndex((version) => version.number === number);
      if (index === -1) throw new ApiError(404, "Version not found.");
      upper = BigInt(versions[index].changeId);
      if (index > 0) lower = BigInt(versions[index - 1].changeId);
    }
    const sources = (
      await this.store.listChangeSources(conversation.id)
    ).filter((row) => {
      const changeId = BigInt(row.changeId);
      return changeId > lower && (upper === null || changeId <= upper);
    });
    const base = { conversationId: conversation.id, number };
    if (sources.length === 0) return { ...base, changes: [], messages: [] };
    // Ranges chain from one linked change to the next, so the segment is one run of messages.
    const start = sources.reduce(
      (min, row) =>
        BigInt(row.rangeStartMessageId) < BigInt(min)
          ? row.rangeStartMessageId
          : min,
      sources[0].rangeStartMessageId,
    );
    const end = sources.reduce(
      (max, row) =>
        BigInt(row.rangeEndMessageId) > BigInt(max)
          ? row.rangeEndMessageId
          : max,
      sources[0].rangeEndMessageId,
    );
    const [messages, allSources] = await Promise.all([
      this.store.listMessageRange(conversation.id, start, end),
      this.store.listChangeSources(conversation.id),
    ]);
    const produced = new Map(
      allSources.map((row) => [row.resultMessageId, row.changeId]),
    );
    return {
      ...base,
      changes: sources.map((row) => ({
        changeId: row.changeId,
        mode: row.mode,
      })),
      messages: messages.map((row) =>
        messageDto(row, produced.get(row.id) ?? null),
      ),
    };
  }

  // A turn runs against the working document. The agent's change is committed in one transaction
  // with the assistant message, the change source link and the new phase and checklist.
  // Concurrency: one turn per conversation. A second turn gets 409 while the first holds its
  // lease. A repeated clientMessageId returns the stored outcome and never runs the agent twice.
  async sendMessage(
    userId: string,
    id: string,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    const parsed = sendMessageSchema.parse(input);
    const prepared = await this.prepare(userId, id, parsed);
    if (prepared.kind === "duplicate") return this.resultFor(prepared);
    try {
      const raw = await this.dependencies.planningService.runTurn(
        prepared.input,
      );
      const committed = await this.commit(prepared, this.validate(raw));
      return this.resultFor(prepared, committed);
    } finally {
      await prepared.release();
    }
  }

  // Same rules as sendMessage. The user message is stored first. The assistant message and any
  // change are stored only after the final result validates. A failed or abandoned stream keeps
  // the user message and records nothing else. Errors before the first event (404, 409) throw.
  // Later failures arrive as an `error` event.
  async *streamMessage(
    userId: string,
    id: string,
    input: SendMessageInput,
  ): AsyncGenerator<SessionEvent> {
    const parsed = sendMessageSchema.parse(input);
    const prepared = await this.prepare(userId, id, parsed);
    let seq = 0;
    const envelope = (
      event: Record<string, unknown> & { type: SessionEvent["type"] },
    ) => {
      seq += 1;
      return {
        id: `${prepared.userMessage.id}:${seq}`,
        seq,
        conversationId: prepared.conversation.id,
        ...event,
      } as SessionEvent;
    };

    if (prepared.kind === "duplicate") {
      yield envelope({
        type: "message.final" as const,
        userMessage: messageDto(prepared.userMessage, null),
        assistantMessage: messageDto(prepared.assistantMessage, null),
        phase: prepared.conversation.phase,
        checklist: prepared.conversation.checklist,
      });
      return;
    }

    try {
      let final: AgentTurnResult | null = null;
      let committed: Committed;
      try {
        for await (const event of this.dependencies.planningService.streamTurn(
          prepared.input,
        )) {
          if (event.type === "reasoning") {
            yield envelope({
              type: "reasoning.delta" as const,
              text: event.text,
            });
          } else if (event.type === "delta") {
            yield envelope({
              type: "message.delta" as const,
              text: event.text,
            });
          } else {
            final = event.result;
          }
        }
        if (!final)
          throw new ApiError(502, "The agent finished without a result.");
        committed = await this.commit(prepared, this.validate(final));
      } catch (error) {
        console.error("Planning stream failed", error);
        yield envelope({ type: "error" as const, ...errorEvent(error) });
        return;
      }

      if (committed.changeId) {
        const described = await this.describeChange(
          prepared.actor,
          committed.conversation,
          committed.changeId,
        );
        yield envelope({
          type: "document.changed" as const,
          change: described.change,
          workingDocument: described.workingDocument,
        });
      }
      yield envelope({
        type: "message.final" as const,
        userMessage: messageDto(prepared.userMessage, null),
        assistantMessage: messageDto(committed.assistant, committed.changeId),
        phase: committed.conversation.phase,
        checklist: committed.conversation.checklist,
      });
    } finally {
      await prepared.release();
    }
  }

  // Human action only. The publish button calls this. The agent port has no way to reach it.
  // Defaults to the working document's change. Main's rules apply: only a change after the
  // latest version can be published, and a published version is permanent.
  async publish(
    userId: string,
    id: string,
    input: PublishInput = {},
  ): Promise<VersionSummary> {
    const parsed = publishSchema.parse(input);
    const { actor, conversation } = await this.load(userId, id);
    if (!conversation.docId)
      throw new ApiError(404, "There is no working document to publish yet.");
    const changeId =
      parsed.changeId ??
      (await this.docs.listChanges(actor, conversation.docId)).at(-1)?.id;
    if (!changeId)
      throw new ApiError(404, "There is no working document to publish yet.");
    const version = await this.docs.publish(
      actor,
      conversation.docId,
      changeId,
    );
    return versionSummary(version);
  }

  // A revert is a new change that carries an earlier change's text. History is never rewritten.
  // It is recorded as a short exchange in the conversation, so the change source links to the
  // message that asked for it.
  async revert(
    userId: string,
    id: string,
    input: RevertInput,
  ): Promise<RevertResult> {
    const parsed = revertSchema.parse(input);
    const { actor, conversation } = await this.load(userId, id);
    if (!conversation.docId) throw new ApiError(404, "Change not found.");
    if (!(await this.store.claimTurn(conversation.id, LEASE_SECONDS)))
      throw new ApiError(409, "A message is still being processed.");
    try {
      const docId = conversation.docId;
      const changes = await this.docs.listChanges(actor, docId);
      const target = changes.find((change) => change.id === parsed.toChangeId);
      if (!target) throw new ApiError(404, "Change not found.");
      const working = changes.at(-1)!;
      if (working.id === target.id || sameDocument(working, target))
        throw new ApiError(409, "The working document already has that text.");

      const apply: ApplyDocument = async (docs) => {
        const row = await docs.addChange(actor, docId, {
          title: target.title,
          content: target.content,
        });
        return { docId, changeId: row.id };
      };
      const committed = await this.store.commitRevert({
        conversationId: conversation.id,
        authorUserId: userId,
        requestText: `Revert the document to change ${target.number}, "${target.title}".`,
        replyText: `Reverted. The working document now matches change ${target.number}. The newer text is still in the history.`,
        revertedToChangeId: target.id,
        applyDocument: apply,
      });
      await this.announce(conversation.id, "document");
      const described = await this.describeChange(
        actor,
        committed.conversation,
        committed.change.changeId,
      );
      return {
        change: described.change,
        workingDocument: described.workingDocument,
        userMessage: messageDto(committed.userMessage, null),
        assistantMessage: messageDto(
          committed.assistant,
          committed.change.changeId,
        ),
      };
    } finally {
      await this.store.releaseTurn(conversation.id);
    }
  }

  // Duplicate check first (no lease needed to return stored work), then the lease, then a second
  // duplicate check for a request that raced the first one to completion.
  private async prepare(
    userId: string,
    id: string,
    input: z.output<typeof sendMessageSchema>,
  ): Promise<Prepared> {
    const { actor, conversation } = await this.load(userId, id);
    const stored = async (): Promise<PreparedDuplicate | null> => {
      if (!input.clientMessageId) return null;
      const user = await this.store.findMessageByClientId(
        conversation.id,
        input.clientMessageId,
      );
      if (!user) return null;
      const assistant = await this.store.findAssistantAfter(
        conversation.id,
        user.id,
      );
      if (!assistant) return null;
      const current =
        (await this.store.findConversation(
          userId,
          actor.organizationId,
          conversation.id,
        )) ?? conversation;
      return {
        kind: "duplicate",
        actor,
        conversation: current,
        userMessage: user,
        assistantMessage: assistant,
      };
    };

    const early = await stored();
    if (early) return early;
    if (!(await this.store.claimTurn(conversation.id, LEASE_SECONDS)))
      throw new ApiError(409, "A message is still being processed.");
    const release = () => this.store.releaseTurn(conversation.id);
    try {
      const raced = await stored();
      if (raced) {
        await release();
        return raced;
      }
      const { message: userMessage, created } =
        await this.store.insertUserMessage(conversation.id, {
          authorUserId: userId,
          content: input.text,
          via: input.via,
          clientMessageId: input.clientMessageId ?? null,
        });
      if (created) await this.announce(conversation.id, "message");
      // State may have moved between load and claim.
      const fresh =
        (await this.store.findConversation(
          userId,
          actor.organizationId,
          conversation.id,
        )) ?? conversation;
      const history = await this.store.listMessages(fresh.id, {
        limit: HISTORY_LIMIT,
      });
      const { working, previous } = await this.drafts(actor, fresh);
      return {
        kind: "run",
        actor,
        conversation: fresh,
        userMessage,
        working,
        previous,
        release,
        input: {
          messages: history.map((row) => ({
            role: row.role,
            content: row.content,
          })),
          phase: fresh.phase,
          checklist: fresh.checklist,
          projectName: fresh.title,
          document: working && {
            title: working.title,
            content: working.content,
          },
          previousDocument: previous && {
            title: previous.title,
            content: previous.content,
          },
          today: new Date().toISOString().slice(0, 10),
        },
      };
    } catch (error) {
      await release();
      throw error;
    }
  }

  private validate(raw: unknown): AgentTurnResult {
    try {
      return agentResultSchema.parse(raw);
    } catch (error) {
      if (error instanceof ZodError)
        throw new ApiError(
          502,
          "The planning agent returned an invalid response.",
        );
      throw error;
    }
  }

  private async commit(
    prepared: PreparedRun,
    result: AgentTurnResult,
  ): Promise<Committed> {
    const { actor, conversation, working, previous } = prepared;
    const draft = result.document;
    let apply: ApplyDocument | null = null;
    let mode: ChangeMode = "edited";
    let revertedTo: string | null = null;

    // A document identical to the working one is not a change.
    if (draft && !(working && sameDocument(working, draft))) {
      const snapshot = { title: draft.title, content: draft.content };
      if (!conversation.docId) {
        mode = "generated";
        apply = async (docs) => {
          const doc = await docs.create(actor, conversation.id, snapshot);
          const changes = await docs.listChanges(actor, doc.id);
          return { docId: doc.id, changeId: changes[changes.length - 1].id };
        };
      } else {
        const docId = conversation.docId;
        if (!working) {
          // The first text for a document that already existed with none.
          mode = "generated";
        } else if (previous && sameDocument(previous, draft)) {
          // An edit that restores the previous change's text is recorded as a revert.
          mode = "reverted";
          revertedTo = previous.changeId;
        }
        apply = async (docs) => {
          const row = await docs.addChange(actor, docId, snapshot);
          return { docId, changeId: row.id };
        };
      }
    }

    const committed = await this.store.commitTurn({
      conversationId: conversation.id,
      triggerMessageId: prepared.userMessage.id,
      reply: result.reply,
      questions: result.questions,
      phase: result.phase,
      checklist: result.checklist,
      skillVersion: result.skillVersion,
      mode,
      revertedToChangeId: revertedTo,
      applyDocument: apply,
      endStandby: false,
    });
    await this.announce(
      conversation.id,
      committed.change ? "document" : "message",
    );
    return {
      assistant: committed.assistant,
      conversation: committed.conversation,
      changeId: committed.change?.changeId ?? null,
    };
  }

  private async resultFor(
    prepared: Prepared,
    committed?: Committed,
  ): Promise<SendMessageResult> {
    const conversation = committed?.conversation ?? prepared.conversation;
    const assistant =
      committed?.assistant ?? (prepared as PreparedDuplicate).assistantMessage;
    const conversationDetail = await this.detail(prepared.actor, conversation);
    const producedId =
      conversationDetail.messages.find((message) => message.id === assistant.id)
        ?.producedChangeId ?? null;
    return {
      userMessage: messageDto(prepared.userMessage, null),
      assistantMessage: messageDto(assistant, producedId),
      conversation: conversationDetail,
    };
  }

  private async drafts(
    actor: OrganizationActor,
    conversation: ConversationRow,
  ) {
    if (!conversation.docId) return { working: null, previous: null };
    const changes = await this.docs.listChanges(actor, conversation.docId);
    // A document the dashboard just created holds one empty change. That is no draft yet.
    const toDraft = (change: DocChange | undefined): Draft | null =>
      change?.content.trim()
        ? { changeId: change.id, title: change.title, content: change.content }
        : null;
    return {
      working: toDraft(changes.at(-1)),
      previous: toDraft(changes.at(-2)),
    };
  }

  private async describeChange(
    actor: OrganizationActor,
    conversation: ConversationRow,
    changeId: string,
  ) {
    const docId = conversation.docId!;
    const [changes, versions, source] = await Promise.all([
      this.docs.listChanges(actor, docId),
      this.docs.listVersions(actor, docId),
      this.store.findChangeSource(conversation.id, changeId),
    ]);
    const change = changes.find((row) => row.id === changeId)!;
    const working = changes.at(-1)!;
    return {
      change: changeSummary(change, source ?? undefined),
      workingDocument: this.workingDto(working, versions.at(-1)),
    };
  }

  private workingDto(
    working: DocChange,
    latest: DocVersion | undefined,
  ): WorkingDocumentDto {
    return {
      changeId: working.id,
      number: working.number,
      title: working.title,
      content: working.content,
      label: workingLabel(working, latest),
      createdAt: working.createdAt,
    };
  }

  // The owner of a conversation that predates participants has no name yet. The first time they
  // open it, the directory fills it in.
  private async participantsFor(userId: string, conversationId: string) {
    const rows = await this.store.listParticipants(conversationId);
    const mine = rows.find((row) => row.userId === userId);
    if (!mine || mine.displayName !== "") return rows;
    const filled = await this.store.addParticipant(conversationId, {
      userId,
      displayName: await this.dependencies.userDirectory.displayName(userId),
    });
    return rows.map((row) => (row.userId === userId ? filled : row));
  }

  private async detail(
    actor: OrganizationActor,
    conversation: ConversationRow,
  ): Promise<ConversationDetail> {
    const [messages, sources, participants] = await Promise.all([
      this.store.listMessages(conversation.id),
      this.store.listChangeSources(conversation.id),
      this.participantsFor(actor.userId, conversation.id),
    ]);
    let changes: DocChange[] = [];
    let versions: DocVersion[] = [];
    if (conversation.docId) {
      [changes, versions] = await Promise.all([
        this.docs.listChanges(actor, conversation.docId),
        this.docs.listVersions(actor, conversation.docId),
      ]);
    }
    const byChange = new Map(sources.map((row) => [row.changeId, row]));
    const produced = new Map(
      sources.map((row) => [row.resultMessageId, row.changeId]),
    );
    // Sources whose change was deleted are gone with it. Marks only survive for live changes.
    const live = new Set(changes.map((change) => change.id));
    const working = changes.at(-1);
    const latest = versions.at(-1);
    let publishedDocument: VersionDetail | null = null;
    if (latest && conversation.docId) {
      const version = await this.docs.getVersion(
        actor,
        conversation.docId,
        latest.number,
      );
      publishedDocument = {
        ...versionSummary(version),
        title: version.title,
        content: version.content,
      };
    }
    return {
      ...listItem(conversation),
      checklist: conversation.checklist,
      skillVersion: conversation.skillVersion,
      participants: participants.map(({ userId, displayName }) => ({
        userId,
        displayName,
      })),
      messages: messages.map((row) => {
        const changeId = produced.get(row.id);
        return messageDto(
          row,
          changeId && live.has(changeId) ? changeId : null,
        );
      }),
      workingDocument: working ? this.workingDto(working, latest) : null,
      publishedDocument,
      changes: changes.map((change) =>
        changeSummary(change, byChange.get(change.id)),
      ),
    };
  }
}
