import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { githubDeliveries, githubInstallations } from "../github/schema";
import { githubRepositories } from "../projects/schema";
import type { ReviewInput, ReviewResult } from "./contracts";

// Durable outbox: webhook admission and the frozen review inputs commit together.
export const githubReviewJobs = pgTable(
  "github_review_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => githubDeliveries.id),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallations.id),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => githubRepositories.id),
    pullNumber: integer("pull_number").notNull(),
    fingerprint: text("fingerprint").notNull().unique(),
    input: jsonb("input").$type<ReviewInput>().notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "completed" | "skipped" | "failed">()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    result: jsonb("result").$type<ReviewResult>(),
    reason: text("reason"),
    reviewId: text("review_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("github_review_jobs_pending_idx").on(table.status, table.availableAt),
    index("github_review_jobs_pull_idx").on(
      table.repositoryId,
      table.pullNumber,
    ),
  ],
);
