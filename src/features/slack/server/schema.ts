import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
