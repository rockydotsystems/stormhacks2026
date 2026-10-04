import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/features/organizations/server/schema";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("projects_org_id_unique").on(table.organizationId, table.id),
  ],
);

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

export const projectRepositories = pgTable(
  "project_repositories",
  {
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    repositoryId: uuid("repository_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.repositoryId] }),
    foreignKey({
      name: "project_repositories_project_fk",
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    foreignKey({
      name: "project_repositories_repository_fk",
      columns: [table.organizationId, table.repositoryId],
      foreignColumns: [
        githubRepositories.organizationId,
        githubRepositories.id,
      ],
    }),
    index("project_repositories_repository_idx").on(table.repositoryId),
  ],
);
