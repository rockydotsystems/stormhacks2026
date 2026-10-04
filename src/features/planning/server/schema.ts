import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  primaryKey,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ChecklistEntry,
  Phase,
  Question,
} from "@/features/planning/contracts";
import { docChanges, docs } from "@/features/docs/server/schema";
import {
  organizationMembers,
  organizations,
  users,
} from "@/features/organizations/server/schema";

// Remembers the WorkOS organization used by the standalone planning workspace.
export const personalWorkspaces = pgTable("personal_workspaces", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  organizationId: text("organization_id")
    .notNull()
    .unique("personal_workspaces_organization_unique")
    .references(() => organizations.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const planningConversations = pgTable(
  "planning_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    // Set when the first working document is generated. One conversation owns at most one doc.
    docId: uuid("doc_id"),
    title: text("title").notNull(),
    phase: text("phase").$type<Phase>().default("grilling").notNull(),
    checklist: jsonb("checklist")
      .$type<ChecklistEntry[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    skillVersion: text("skill_version"),
    // Standby is the shared discussion state. While it holds, the agent does not answer messages.
    // standby_since_message_id is the standby announcement, so the discussion is every message
    // after it.
    mode: text("mode")
      .$type<"active" | "standby">()
      .default("active")
      .notNull(),
    standbySinceMessageId: bigint("standby_since_message_id", {
      mode: "bigint",
    }),
    // Lease for the turn in flight. An expired lease can be claimed again, so a crash cannot wedge a conversation.
    turnLockedAt: timestamp("turn_locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "planning_conversations_member_fk",
      columns: [table.organizationId, table.userId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.userId,
      ],
    }),
    // Skipped while doc_id is null, and keeps the doc inside the conversation's organization.
    foreignKey({
      name: "planning_conversations_doc_fk",
      columns: [table.organizationId, table.docId],
      foreignColumns: [docs.organizationId, docs.id],
    }),
    unique("planning_conversations_doc_unique").on(table.docId),
    // Lets change sources prove that a change belongs to the conversation's own doc.
    unique("planning_conversations_id_doc_unique").on(table.id, table.docId),
    check(
      "planning_conversations_phase_check",
      sql`${table.phase} in ('grilling', 'awaiting-confirmation', 'generated')`,
    ),
    check(
      "planning_conversations_mode_check",
      sql`${table.mode} in ('active', 'standby')`,
    ),
    check(
      "planning_conversations_standby_check",
      sql`(${table.mode} = 'standby') = (${table.standbySinceMessageId} is not null)`,
    ),
    index("planning_conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt.desc(),
    ),
  ],
);

// Everyone who may read and write a conversation. The owner is always one. Others join by
// opening the conversation's document, after the docs layer has verified their organization.
// The display name is a snapshot taken at join time, so messages never wait on the identity provider.
export const planningParticipants = pgTable(
  "planning_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => planningConversations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    displayName: text("display_name").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index("planning_participants_user_idx").on(table.userId),
  ],
);

export const planningMessages = pgTable(
  "planning_messages",
  {
    id: bigint("id", { mode: "bigint" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => planningConversations.id),
    role: text("role").$type<"user" | "assistant">().notNull(),
    // The human who wrote a user message. Null for the agent.
    authorUserId: text("author_user_id").references(() => users.id),
    content: text("content").notNull(),
    // "chat" is an ordinary message. The standby kinds are fixed notices the server writes when
    // the agent goes quiet or listens again, so the UI can show them as notices.
    kind: text("kind")
      .$type<"chat" | "standby-start" | "standby-end">()
      .default("chat")
      .notNull(),
    // Voice turns store the transcript only, never the audio.
    via: text("via").$type<"text" | "voice">().default("text").notNull(),
    // The agent's questions with optional suggested answers. Only on assistant messages.
    questions: jsonb("questions").$type<Question[]>(),
    // Client-chosen key that makes a resend of the same user message a no-op.
    clientMessageId: uuid("client_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "planning_messages_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
    check(
      "planning_messages_author_check",
      sql`(${table.role} = 'assistant') = (${table.authorUserId} is null)`,
    ),
    check(
      "planning_messages_kind_check",
      sql`${table.kind} in ('chat', 'standby-start', 'standby-end')`,
    ),
    check(
      "planning_messages_via_check",
      sql`${table.via} in ('text', 'voice')`,
    ),
    unique("planning_messages_client_message_unique").on(
      table.conversationId,
      table.clientMessageId,
    ),
    index("planning_messages_conversation_idx").on(
      table.conversationId,
      table.id,
    ),
  ],
);

// Ties every working document change to the conversation segment that produced it, so people can
// open the earlier conversation behind any change. doc_changes belongs to the data layer and
// carries only the author's user id, so the link lives in our own table.
// The composite foreign key cascades: DocsService.deleteChange on a draft still works and removes
// the link with it. The guard trigger on doc_changes fires before the cascade and still rejects
// deleting published history, and this table has no triggers of its own. Messages are never deleted.
export const planningChangeSources = pgTable(
  "planning_change_sources",
  {
    docId: uuid("doc_id").notNull(),
    changeId: bigint("change_id", { mode: "bigint" }).notNull(),
    conversationId: uuid("conversation_id").notNull(),
    // The user message that caused the change. For a revert, the message that asked for it.
    triggerMessageId: bigint("trigger_message_id", {
      mode: "bigint",
    }).notNull(),
    // The assistant message that announced the change.
    resultMessageId: bigint("result_message_id", { mode: "bigint" }).notNull(),
    // Messages since the previous linked change in this conversation, up to and including the result.
    rangeStartMessageId: bigint("range_start_message_id", {
      mode: "bigint",
    }).notNull(),
    rangeEndMessageId: bigint("range_end_message_id", {
      mode: "bigint",
    }).notNull(),
    mode: text("mode").$type<"generated" | "edited" | "reverted">().notNull(),
    // Only for mode "reverted": the change whose content this change restored.
    revertedToChangeId: bigint("reverted_to_change_id", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("planning_change_sources_doc_change_unique").on(
      table.docId,
      table.changeId,
    ),
    foreignKey({
      name: "planning_change_sources_change_fk",
      columns: [table.docId, table.changeId],
      foreignColumns: [docChanges.docId, docChanges.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "planning_change_sources_conversation_fk",
      columns: [table.conversationId, table.docId],
      foreignColumns: [planningConversations.id, planningConversations.docId],
    }),
    foreignKey({
      name: "planning_change_sources_trigger_fk",
      columns: [table.triggerMessageId],
      foreignColumns: [planningMessages.id],
    }),
    foreignKey({
      name: "planning_change_sources_result_fk",
      columns: [table.resultMessageId],
      foreignColumns: [planningMessages.id],
    }),
    foreignKey({
      name: "planning_change_sources_range_start_fk",
      columns: [table.rangeStartMessageId],
      foreignColumns: [planningMessages.id],
    }),
    foreignKey({
      name: "planning_change_sources_range_end_fk",
      columns: [table.rangeEndMessageId],
      foreignColumns: [planningMessages.id],
    }),
    check(
      "planning_change_sources_mode_check",
      sql`${table.mode} in ('generated', 'edited', 'reverted')`,
    ),
    check(
      "planning_change_sources_revert_check",
      sql`(${table.mode} = 'reverted') = (${table.revertedToChangeId} is not null)`,
    ),
    index("planning_change_sources_conversation_idx").on(
      table.conversationId,
      table.changeId,
    ),
  ],
);
