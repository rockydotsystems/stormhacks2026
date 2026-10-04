import type { DocsService } from "@/features/docs/server/docs.service";
import type {
  ChecklistEntry,
  Phase,
  Question,
} from "@/features/planning/contracts";
import type { ChangeMode } from "@/features/planning/session-contracts";

// The slice of the docs data layer the planning session uses. Publishing is here for the human
// publish button only. The agent port below has no handle on it.
export type DocsPort = Pick<
  DocsService,
  | "create"
  | "addChange"
  | "listChanges"
  | "publish"
  | "listVersions"
  | "getVersion"
>;

export type ConversationRow = {
  id: string;
  userId: string;
  organizationId: string;
  docId: string | null;
  title: string;
  phase: Phase;
  checklist: ChecklistEntry[];
  skillVersion: string | null;
  // Standby: people are discussing, so the agent stays quiet. The discussion is every message
  // after standbySinceMessageId, which is the standby announcement.
  mode: "active" | "standby";
  standbySinceMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageKind = "chat" | "standby-start" | "standby-end";

export type ParticipantRow = {
  userId: string;
  displayName: string;
  joinedAt: Date;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  // The human who wrote a user message. Null for the agent.
  authorUserId: string | null;
  content: string;
  // The standby kinds are fixed notices written by the server.
  kind: MessageKind;
  via: "text" | "voice";
  questions: Question[] | null;
  clientMessageId: string | null;
  createdAt: Date;
};

export type ChangeSourceRow = {
  docId: string;
  changeId: string;
  conversationId: string;
  triggerMessageId: string;
  resultMessageId: string;
  rangeStartMessageId: string;
  rangeEndMessageId: string;
  mode: ChangeMode;
  revertedToChangeId: string | null;
  createdAt: Date;
};

export type AppliedChange = { docId: string; changeId: string };

// Runs inside the commit transaction against a docs port bound to that transaction, so the
// change, the assistant message, the change source and the conversation state commit together.
export type ApplyDocument = (docs: DocsPort) => Promise<AppliedChange>;

export type CommitTurnInput = {
  conversationId: string;
  triggerMessageId: string;
  reply: string;
  questions: Question[];
  phase: Phase;
  checklist: ChecklistEntry[];
  skillVersion: string;
  // Used only when applyDocument is set.
  mode: ChangeMode;
  revertedToChangeId: string | null;
  applyDocument: ApplyDocument | null;
  // Leaves standby in the same transaction, so the change and the mode move together.
  endStandby: boolean;
};

export type CommitTurnResult = {
  assistant: MessageRow;
  conversation: ConversationRow;
  change: AppliedChange | null;
};

export type CommitRevertInput = {
  conversationId: string;
  authorUserId: string;
  requestText: string;
  replyText: string;
  revertedToChangeId: string;
  applyDocument: ApplyDocument;
};

export type CommitRevertResult = {
  userMessage: MessageRow;
  assistant: MessageRow;
  change: AppliedChange;
  conversation: ConversationRow;
};

// All reads and writes the session service needs. The Drizzle implementation is the real one.
// Tests use an in-memory implementation, so service rules run without a database.
export interface PlanningSessionStore {
  // A conversation bound to an existing doc starts with that doc and, when the doc already has
  // text, in the generated phase.
  createConversation(input: {
    userId: string;
    // The owner joins as the first participant under this name.
    displayName: string;
    organizationId: string;
    title: string;
    docId?: string | null;
    phase?: Phase;
  }): Promise<ConversationRow>;
  findConversation(
    userId: string,
    organizationId: string,
    id: string,
  ): Promise<ConversationRow | null>;
  // By participant (the owner is one). The conversation's own organization decides what the
  // user acts as.
  findConversationForUser(
    userId: string,
    id: string,
  ): Promise<ConversationRow | null>;
  // No access check. For joining, after the caller has proven organization membership.
  findConversationById(id: string): Promise<ConversationRow | null>;
  // One conversation plans one document, whoever owns it. Callers check the organization.
  findConversationByDoc(docId: string): Promise<ConversationRow | null>;
  // Adds the user, or fills in a missing name. An existing name is kept.
  addParticipant(
    conversationId: string,
    participant: { userId: string; displayName: string },
  ): Promise<ParticipantRow>;
  listParticipants(conversationId: string): Promise<ParticipantRow[]>;
  listConversations(
    userId: string,
    organizationId: string,
  ): Promise<ConversationRow[]>;
  // Goes quiet: sets standby, writes the announcement and points standby at it. Null when the
  // conversation is already in standby, so concurrent callers announce once.
  enterStandby(
    conversationId: string,
    announcement: string,
  ): Promise<{ conversation: ConversationRow; message: MessageRow } | null>;
  // Listens again without applying anything. Null when the conversation is not in standby.
  exitStandby(
    conversationId: string,
    notice: string,
  ): Promise<{ conversation: ConversationRow; message: MessageRow } | null>;
  // Ascending. Everything after a message, such as the discussion since standby began.
  listMessagesAfter(
    conversationId: string,
    messageId: string,
  ): Promise<MessageRow[]>;
  // Takes the turn lease. False when another turn holds an unexpired lease.
  claimTurn(conversationId: string, leaseSeconds: number): Promise<boolean>;
  releaseTurn(conversationId: string): Promise<void>;
  findMessageByClientId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageRow | null>;
  insertUserMessage(
    conversationId: string,
    input: {
      authorUserId: string;
      content: string;
      via: "text" | "voice";
      clientMessageId: string | null;
    },
  ): Promise<{ message: MessageRow; created: boolean }>;
  findAssistantAfter(
    conversationId: string,
    messageId: string,
  ): Promise<MessageRow | null>;
  // Ascending by id. With a limit, the most recent messages.
  listMessages(
    conversationId: string,
    options?: { limit?: number },
  ): Promise<MessageRow[]>;
  listMessageRange(
    conversationId: string,
    startMessageId: string,
    endMessageId: string,
  ): Promise<MessageRow[]>;
  commitTurn(input: CommitTurnInput): Promise<CommitTurnResult>;
  commitRevert(input: CommitRevertInput): Promise<CommitRevertResult>;
  listChangeSources(conversationId: string): Promise<ChangeSourceRow[]>;
  findChangeSource(
    conversationId: string,
    changeId: string,
  ): Promise<ChangeSourceRow | null>;
}
