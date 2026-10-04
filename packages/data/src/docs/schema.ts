import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "../organizations/schema";
import { projects } from "../projects/schema";

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("docs_org_id_unique").on(table.organizationId, table.id),
    foreignKey({
      name: "docs_project_fk",
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    index("docs_project_idx").on(table.projectId),
  ],
);

export const docChanges = pgTable(
  "doc_changes",
  {
    // A global snapshot identity, never the per-doc display change number.
    id: bigint("id", { mode: "bigint" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    title: text("title").notNull(),
    content: text("content").notNull(),
    proposed: boolean("proposed").default(false).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("doc_changes_doc_id_unique").on(table.docId, table.id)],
);

export const docVersions = pgTable(
  "doc_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    changeId: bigint("change_id", { mode: "bigint" }).notNull(),
    // The publication trigger allocates the next version while holding the doc lock.
    number: integer("number").default(0).notNull(),
    publishedBy: text("published_by")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.docId, table.changeId],
      foreignColumns: [docChanges.docId, docChanges.id],
    }),
    unique("doc_versions_doc_number_unique").on(table.docId, table.number),
    unique("doc_versions_doc_change_unique").on(table.docId, table.changeId),
    check("doc_versions_positive_number", sql`${table.number} > 0`),
  ],
);
