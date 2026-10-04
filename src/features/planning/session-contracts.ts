import { z } from "zod";
import { changeIdSchema } from "@/features/docs/contracts";
import {
  checklistEntrySchema,
  gateKindSchema,
  phaseSchema,
  questionSchema,
} from "@/features/planning/contracts";

// Client-safe contracts for the persisted planning session API.
// Dates are ISO strings. Bigint ids (messages, changes) are decimal strings. Never address a
// change by its display number, because draft deletion renumbers history. Use its id.
// Terms: the working document is the latest change. The published document is the newest version.

export const createConversationSchema = z
  .object({
    projectName: z.string().trim().min(1).max(200),
    // Plans an existing document instead of creating one. The organization names the one the
    // document lives in. Both are given together.
    documentId: z.string().uuid().optional(),
    organizationId: z.string().trim().min(1).max(200).optional(),
  })
  .refine((value) => !value.documentId || Boolean(value.organizationId), {
    message: "A document needs its organization.",
  });
export type CreateConversationInput = z.input<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  via: z.enum(["text", "voice"]).default("text"),
  // Resending the same id returns the stored outcome instead of running the turn again.
  clientMessageId: z.string().uuid().optional(),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

// Humans only. Defaults to the working document's change.
export const publishSchema = z.object({ changeId: changeIdSchema.optional() });
export type PublishInput = z.input<typeof publishSchema>;

export const revertSchema = z.object({ toChangeId: changeIdSchema });
export type RevertInput = z.input<typeof revertSchema>;

export const changeModeSchema = z.enum(["generated", "edited", "reverted"]);
export type ChangeMode = z.infer<typeof changeModeSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  // The participant who wrote a user message. Null for the agent.
  authorUserId: z.string().nullable(),
  // "chat" is an ordinary message. The standby kinds are fixed notices from the server.
  kind: z.enum(["chat", "standby-start", "standby-end"]),
  // Voice turns keep their transcript text, which is what a change source shows.
  content: z.string(),
  via: z.enum(["text", "voice"]),
  questions: z.array(questionSchema).nullable(),
  createdAt: z.string(),
  // Set on the assistant message that announced a change.
  producedChangeId: z.string().nullable(),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const changeSourceSummarySchema = z.object({
  conversationId: z.string().uuid(),
  triggerMessageId: z.string(),
  mode: changeModeSchema,
});
export type ChangeSourceSummary = z.infer<typeof changeSourceSummarySchema>;

export const changeSummarySchema = z.object({
  id: z.string(),
  // Display number, 1..N over surviving changes. Not stable.
  number: z.number().int(),
  title: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  // True when a published version froze this change.
  immutable: z.boolean(),
  // Null for changes made outside a planning conversation.
  source: changeSourceSummarySchema.nullable(),
});
export type ChangeSummary = z.infer<typeof changeSummarySchema>;

export const workingDocumentSchema = z.object({
  changeId: z.string(),
  number: z.number().int(),
  title: z.string(),
  content: z.string(),
  // "v0" before the first publish. "working, after v2" when the working document is ahead of
  // version 2. "v2" when the working document is exactly the published one.
  label: z.string(),
  createdAt: z.string(),
});
export type WorkingDocumentDto = z.infer<typeof workingDocumentSchema>;

export const versionSummarySchema = z.object({
  number: z.number().int(),
  label: z.string(),
  changeId: z.string(),
  publishedBy: z.string(),
  publishedAt: z.string(),
});
export type VersionSummary = z.infer<typeof versionSummarySchema>;

export const versionDetailSchema = versionSummarySchema.extend({
  title: z.string(),
  content: z.string(),
});
export type VersionDetail = z.infer<typeof versionDetailSchema>;

export const conversationListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  phase: phaseSchema,
  // In standby, people are discussing and the agent stays quiet until they agree.
  mode: z.enum(["active", "standby"]),
  hasDocument: z.boolean(),
  // The document this conversation plans. Null until the first draft creates one.
  documentId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

export const participantSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
});
export type ParticipantDto = z.infer<typeof participantSchema>;

export const conversationDetailSchema = conversationListItemSchema.extend({
  checklist: z.array(checklistEntrySchema),
  // Everyone in the chat, owner first. Use it to name the author of each message.
  participants: z.array(participantSchema),
  skillVersion: z.string().nullable(),
  // A change the agent is holding until the people acknowledge what was said before and give a
  // reason. Null when nothing is held.
  pendingGate: z
    .object({ kind: gateKindSchema, summary: z.string() })
    .nullable(),
  messages: z.array(messageSchema),
  workingDocument: workingDocumentSchema.nullable(),
  publishedDocument: versionDetailSchema.nullable(),
  changes: z.array(changeSummarySchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const sendMessageResultSchema = z.object({
  userMessage: messageSchema,
  // Null while the conversation is in standby and the agent has not been asked to act.
  assistantMessage: messageSchema.nullable(),
  conversation: conversationDetailSchema,
});
export type SendMessageResult = z.infer<typeof sendMessageResultSchema>;

export const revertResultSchema = z.object({
  change: changeSummarySchema,
  workingDocument: workingDocumentSchema,
  userMessage: messageSchema,
  assistantMessage: messageSchema,
});
export type RevertResult = z.infer<typeof revertResultSchema>;

// The conversation segment behind one change: everything since the previous linked change in
// that conversation, up to and including the message that announced it.
export const changeSourceDetailSchema = z.object({
  conversationId: z.string().uuid(),
  changeId: z.string(),
  mode: changeModeSchema,
  triggerMessageId: z.string(),
  resultMessageId: z.string(),
  revertedToChangeId: z.string().nullable(),
  range: z.object({ startMessageId: z.string(), endMessageId: z.string() }),
  messages: z.array(messageSchema),
});
export type ChangeSourceDetail = z.infer<typeof changeSourceDetailSchema>;

// The conversation behind one published version, or behind the current draft: every message from
// the first change after the previous version up to the last change in this one.
export const versionSourceSchema = z.object({
  conversationId: z.string().uuid(),
  // Null for the current draft, which has no version number yet.
  number: z.number().int().nullable(),
  changes: z.array(z.object({ changeId: z.string(), mode: changeModeSchema })),
  messages: z.array(messageSchema),
});
export type VersionSource = z.infer<typeof versionSourceSchema>;

// Streaming. One envelope per event. `seq` counts from 1 inside one streamed turn and `id` is
// `<userMessageId>:<seq>`. Only the final state is durable. After a dropped stream, reload the
// conversation detail instead of replaying deltas, because the turn either committed or did not.
const eventBase = z.object({
  id: z.string(),
  seq: z.number().int().min(1),
  conversationId: z.string().uuid(),
});

export const sessionEventSchema = z.discriminatedUnion("type", [
  // The model's reasoning while it works out the reply. Shown live and never stored.
  eventBase.extend({ type: z.literal("reasoning.delta"), text: z.string() }),
  eventBase.extend({ type: z.literal("message.delta"), text: z.string() }),
  eventBase.extend({
    type: z.literal("document.changed"),
    change: changeSummarySchema,
    workingDocument: workingDocumentSchema,
  }),
  eventBase.extend({
    type: z.literal("message.final"),
    userMessage: messageSchema,
    assistantMessage: messageSchema.nullable(),
    phase: phaseSchema,
    checklist: z.array(checklistEntrySchema),
  }),
  eventBase.extend({
    type: z.literal("error"),
    code: z.enum([
      "agent_failed",
      "invalid_output",
      "conflict",
      "not_found",
      "internal",
    ]),
    // Generic text. Provider details never reach the client.
    message: z.string(),
  }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;

// A short account of the conversation behind a change or a version. Empty when no conversation
// was recorded for it.
export const historySummarySchema = z.object({ summary: z.string() });
export type HistorySummary = z.infer<typeof historySummarySchema>;
