import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { docs, docVersions } from "../docs/schema";
import { organizations, users } from "../organizations/schema";
import { projects } from "../projects/schema";
import type { SyncPlan, SyncStatus } from "./contracts";

// One Linear workspace per organization. The admin who connected it owns the WorkOS Pipes
// connection that syncs use. No token is stored here.
export const linearConnections = pgTable("linear_connections", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id),
  linearOrganizationId: text("linear_organization_id").notNull(),
  linearOrganizationName: text("linear_organization_name").notNull(),
  linearUrlKey: text("linear_url_key").notNull(),
  connectedBy: text("connected_by")
    .notNull()
    .references(() => users.id),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Linear team to whydidwedothis project.
export const linearProjectLinks = pgTable(
  "linear_project_links",
  {
    projectId: uuid("project_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    linearTeamId: text("linear_team_id").notNull(),
    teamName: text("team_name").notNull(),
    teamKey: text("team_key").notNull(),
  },
  (table) => [
    foreignKey({
      name: "linear_project_links_project_fk",
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
  ],
);

// Linear project to document.
export const linearDocLinks = pgTable("linear_doc_links", {
  docId: uuid("doc_id")
    .primaryKey()
    .references(() => docs.id),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  linearProjectId: text("linear_project_id").notNull(),
  linearProjectUrl: text("linear_project_url").notNull(),
});

export const linearSyncs = pgTable(
  "linear_syncs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => docVersions.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id),
    status: text("status").$type<SyncStatus>().notNull().default("running"),
    // Frozen extraction. A retry resumes from this plan and the completed keys below.
    plan: jsonb("plan").$type<SyncPlan>(),
    completedKeys: jsonb("completed_keys")
      .$type<string[]>()
      .notNull()
      .default([]),
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("linear_syncs_doc_idx").on(table.docId, table.createdAt),
    // At most one active run per document, so two editors cannot race.
    uniqueIndex("linear_syncs_one_running_idx")
      .on(table.docId)
      .where(sql`${table.status} = 'running'`),
  ],
);

export const linearIssueLinks = pgTable(
  "linear_issue_links",
  {
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    itemKey: text("item_key").notNull(),
    linearIssueId: text("linear_issue_id").notNull(),
    identifier: text("identifier").notNull(),
    url: text("url").notNull(),
    parentKey: text("parent_key"),
    contentHash: text("content_hash").notNull(),
    title: text("title").notNull(),
  },
  (table) => [primaryKey({ columns: [table.docId, table.itemKey] })],
);
