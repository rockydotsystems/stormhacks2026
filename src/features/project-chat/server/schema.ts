import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { projects } from "@/features/projects/server/schema";
import type { ChatSource } from "../contracts";

export const projectChats = pgTable(
  "project_chats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    organizationId: text("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    turnToken: uuid("turn_token"),
    turnStartedAt: timestamp("turn_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    index("project_chats_owner_project_idx").on(
      table.ownerId,
      table.projectId,
      table.updatedAt,
    ),
  ],
);

export const projectChatTurns = pgTable(
  "project_chat_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => projectChats.id, { onDelete: "cascade" }),
    clientMessageId: uuid("client_message_id").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    via: text("via").$type<"text" | "voice">().notNull(),
    sources: jsonb("sources").$type<ChatSource[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("project_chat_turns_retry_unique").on(
      table.chatId,
      table.clientMessageId,
    ),
    index("project_chat_turns_chat_idx").on(table.chatId, table.createdAt),
    check(
      "project_chat_turns_via_check",
      sql`${table.via} in ('text', 'voice')`,
    ),
  ],
);
