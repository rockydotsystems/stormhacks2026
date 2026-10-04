import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "@/features/organizations/server/schema";

export const githubRepositories = pgTable(
  "github_repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    unique("github_repositories_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    unique("github_repositories_org_slug_unique").on(
      table.organizationId,
      table.owner,
      table.name,
    ),
  ],
);

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("docs_org_id_unique").on(table.organizationId, table.id)],
);

export const docRepositories = pgTable(
  "doc_repositories",
  {
    organizationId: uuid("organization_id").notNull(),
    docId: uuid("doc_id").notNull(),
    repositoryId: uuid("repository_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.docId, table.repositoryId] }),
    foreignKey({
      columns: [table.organizationId, table.docId],
      foreignColumns: [docs.organizationId, docs.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.repositoryId],
      foreignColumns: [
        githubRepositories.organizationId,
        githubRepositories.id,
      ],
    }),
    index("doc_repositories_repository_idx").on(table.repositoryId),
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
