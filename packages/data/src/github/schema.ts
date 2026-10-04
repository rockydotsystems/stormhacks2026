import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "../organizations/schema";
import { githubRepositories } from "../projects/schema";

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountLogin: text("account_login").notNull(),
    connectedBy: text("connected_by")
      .notNull()
      .references(() => users.id),
    githubUserId: text("github_user_id").notNull(),
    githubUserLogin: text("github_user_login").notNull(),
    active: boolean("active").notNull().default(true),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("github_installations_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    index("github_installations_org_idx").on(table.organizationId),
  ],
);

export const githubRepositoryAccess = pgTable(
  "github_repository_access",
  {
    repositoryId: uuid("repository_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    installationId: text("installation_id").notNull(),
    githubId: text("github_id").notNull(),
    authorized: boolean("authorized").notNull().default(true),
    available: boolean("available").notNull().default(true),
  },
  (table) => [
    unique("github_repository_access_remote_unique").on(
      table.installationId,
      table.githubId,
    ),
    foreignKey({
      name: "github_access_installation_fk",
      columns: [table.organizationId, table.installationId],
      foreignColumns: [
        githubInstallations.organizationId,
        githubInstallations.id,
      ],
    }),
    foreignKey({
      name: "github_access_repository_fk",
      columns: [table.organizationId, table.repositoryId],
      foreignColumns: [
        githubRepositories.organizationId,
        githubRepositories.id,
      ],
    }),
  ],
);

export const githubOAuthStates = pgTable(
  "github_oauth_states",
  {
    hash: text("hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountLogin: text("account_login").notNull(),
    verifier: text("verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("github_oauth_states_expiry_idx").on(table.expiresAt)],
);

export const githubDeliveries = pgTable(
  "github_deliveries",
  {
    id: uuid("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallations.id),
    repositoryId: uuid("repository_id").references(() => githubRepositories.id),
    event: text("event").notNull(),
    action: text("action"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("github_deliveries_installation_time_idx").on(
      table.installationId,
      table.receivedAt,
    ),
  ],
);
