import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { SlackMention } from "./events";

export const slackJobs = pgTable("slack_jobs", {
  eventId: text("event_id").primaryKey(),
  input: jsonb("input").$type<SlackMention>().notNull(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: text("lease_token"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const slackWorkspaces = pgTable("slack_workspaces", {
  teamId: text("team_id").primaryKey(),
  organizationId: text("organization_id").notNull().unique(),
  name: text("name").notNull(),
});

export const slackChannels = pgTable(
  "slack_channels",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => slackWorkspaces.teamId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    name: text("name").notNull(),
    projectId: uuid("project_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.channelId] })],
);

export const slackUsers = pgTable(
  "slack_users",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => slackWorkspaces.teamId, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.slackUserId] }),
    unique().on(table.teamId, table.userId),
  ],
);
