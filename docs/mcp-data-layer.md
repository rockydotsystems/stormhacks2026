# MCP data layer

## Scope

Implemented the persisted foundation for MCP and UI callers. ADRs are called
**docs** throughout the new schema and services. No MCP transport, HTTP endpoints,
GitHub OAuth/API calls, or UI persistence wiring are included in this phase.
The existing starter notes feature remains unchanged.

## Model

| Table                  | Responsibility                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `organizations`        | Organization identity and name                                             |
| `users`                | Local identity references using authenticated provider user IDs            |
| `organization_members` | Many-to-many organization membership                                       |
| `github_repositories`  | Repositories connected to an organization                                  |
| `docs`                 | Stable organization-owned document identity                                |
| `doc_repositories`     | Many-to-many doc/repository associations                                   |
| `doc_changes`          | Full title and Markdown snapshots, author, creation time                   |
| `doc_versions`         | Permanent published snapshots, version number, publisher, publication time |

An org can have multiple users, docs, and repositories. A user can belong to
multiple orgs. A doc can link to any number of its org's repositories, and a
repository can link to any number of docs. Composite foreign keys prevent
cross-org links; there is no cardinality cap. GitHub owner/name pairs are
normalized to lowercase by the service and unique within an org. Connecting
a repository records its identity only; it does not verify GitHub access.

Repository links are live doc metadata, not part of a published content snapshot.
Published title/content remain unchanged when links are added or removed.

## History and publication

- Creating a doc also writes its initial full snapshot.
- Every subsequent save inserts another full title/content snapshot. Content
  does not depend on reconstructing earlier changes or applying diffs.
- Snapshots are append-only: even unpublished snapshots are not edited in place.
  Save a new snapshot or delete an eligible draft instead.
- The snapshot's global bigint primary key is a stable identity/order key,
  **not** a stored per-doc change number. IDs serialize as decimal strings.
- History computes display change numbers as `1..N` using `row_number()` over
  surviving snapshot IDs. Draft deletion renumbers the remaining draft history.
  Callers must address changes by stable ID, never by display number.
- Publishing a selected snapshot creates `v1`, then `v2`, then `v3`, etc.,
  independently for each doc. Only a change after the last published boundary
  can be published; older or already-published changes return a conflict.
- Publishing freezes that snapshot **and every earlier surviving change**,
  including earlier snapshots that were not themselves tagged.
- Later drafts stay deletable, even if they were written before publication.
  Any eligible draft can be deleted, including the first, middle, or last. A doc
  with no published history may have zero changes after deleting all its drafts.
- Versions cannot be updated, deleted, or unpublished. The next version can
  never reuse a removed version number because versions cannot be removed.

Example: changes A, B, C, D are numbered 1, 2, 3, 4. Publish B as v1: A and B
freeze; C and D remain drafts. Delete C: A, B, D are numbered 1, 2, 3, while D's
identity and full content remain unchanged. Publish D as v2: all three freeze.

We chose snapshot rows plus separate version rows over a mutable draft/release
pair because arbitrary draft deletion and historical version reads need the
same independent full-snapshot representation.

## Service boundary

`OrganizationsService` and `DocsService` are registered as request-scoped Awilix
services. They reuse the existing request-scoped Drizzle/Postgres.js connection;
the scope disposer closes it, and Hyperdrive owns pooling.

Future adapters must authenticate first and construct an `OrganizationActor`
using the authenticated user ID and selected org ID. Never accept a user ID from
MCP tool arguments or browser input as proof of identity. Every docs operation
checks membership and scopes doc/repository lookups to the selected org.
An inaccessible organization/doc/repository returns 404 without disclosing
another tenant's data. Published-history conflicts return 409. Input schemas
are exported for future transport validation; service writes validate snapshots,
repository names, and change IDs as well.

```ts
const actor = { userId: authenticatedUser.id, organizationId };
const doc = await scope.cradle.docsService.create(actor, {
  title: "Use PostgreSQL",
  content: "# Context\n\nWe need relational constraints...",
});
const history = await scope.cradle.docsService.listChanges(actor, doc.id);
const version = await scope.cradle.docsService.publish(
  actor,
  doc.id,
  history[0].id,
);
// version.label === "v1"
const published = await scope.cradle.docsService.getVersion(actor, doc.id, 1);
```

Available operations:

- Organizations: `create`, `list`, `addMember` (idempotent).
- Docs: `create`, `list`.
- Changes: `addChange`, `listChanges`, `deleteChange`.
- Versions: `publish`, `listVersions`, `getVersion` (includes frozen title/content).
- Repositories: `connectRepository` (idempotent), `listRepositories`,
  `linkRepository` (idempotent), `unlinkRepository`, `listDocRepositories`.

Membership currently has no roles: all members have the same data-layer
permissions, including adding members. Identity provisioning is local; membership
is not automatically synced from WorkOS. Before exposing member management,
decide whether to add roles/invitations or use verified provider membership sync.

## Database enforcement and concurrency

The services lock the parent doc before appending, deleting, or publishing.
Postgres triggers take the same lock for direct snapshot/version writes,
allocate the next version number, reject publication behind the current boundary,
reject all snapshot updates, and reject version updates/deletes. An explicit
snapshot-ID backfill into a published prefix is rejected too. Doc identity and
org assignment cannot be updated. Foreign keys use restrictive deletion, so
deleting a parent cannot cascade away published history.

Concurrent publication of the same snapshot has one winner. A publish/delete
race leaves either a published immutable snapshot or a deleted untagged snapshot,
never a dangling version. No distributed lock or Worker singleton state is used.

These protect ordinary SQL writes, not a database administrator who can disable
triggers, truncate tables, or change the schema. Runtime credentials should not
have schema-management privileges. Tenant authorization is owned by the services,
not PostgreSQL row-level security; never expose a raw SQL tool to an MCP client.

## Files and migration

- `src/features/organizations/server/`: schema and membership service.
- `src/features/docs/contracts.ts`: client-safe inputs and response types.
- `src/features/docs/server/`: schema, business operations, and Postgres tests.
- `src/server/container.ts`: scoped registrations for both services.
- `drizzle/0001_chemical_black_crow.sql` and `drizzle/meta/`: additive tables,
  constraints, and hand-authored lifecycle triggers. The triggers are part of the
  committed migration, not generated from the Drizzle table declarations.

Apply migrations with `pnpm db:migrate` against an explicitly chosen direct
database URL. GitHub Actions now runs this command automatically after checks
and build validation, before every main Worker deployment, using the
`production` environment's `DATABASE_URL` secret. Missing credentials or a
failed migration block deployment. Drizzle skips already-applied migrations.
Migrations are not run inside Worker requests. Retain trigger SQL when changing
the schema; a future Drizzle generation does not regenerate trigger definitions.

## Verification

Run the repository checks and deployment dry-run:

```sh
pnpm check
pnpm deploy:check
```

Run the new real-Postgres suite against a local disposable database:

```sh
TEST_DATABASE_URL=postgres://stormhacks:stormhacks@127.0.0.1:5432/stormhacks \
  pnpm exec vitest run src/features/docs
```

The docs suite creates a uniquely named `docs_test_*` database, applies the
committed migrations, and drops only that database afterward. The configured
local test user needs `CREATEDB`. It never deletes or truncates tables in the
configured database. Without `TEST_DATABASE_URL`, integration tests are skipped.
Never use hosted or production credentials for this suite.

Coverage includes membership and tenant isolation; full-snapshot persistence;
arbitrary draft deletion and computed numbering; v1/v2/v3 progression; freezing
prior changes; immutable version reads; direct-SQL mutation/backfill rejection;
same-doc version references; many-to-many repository links; and concurrent
publication and publish/delete races. Contract tests cover blank titles,
GitHub normalization, invalid repository paths, and bigint ID boundaries.

To include the existing notes integration test in a full `pnpm test` run, first
migrate the configured disposable database as documented in the README. The docs
suite migrates its own database independently.

Verified locally using the pinned Nix environment and an isolated PostgreSQL 18
cluster:

- `pnpm check`: passed; 37 tests passed, including all nine docs integration
  tests and the existing notes integration test. Lint, TypeScript, and formatting
  passed as well.
- `pnpm deploy:check`: passed; vinext production build and Wrangler dry-run
  completed without publishing. vinext emitted its existing dynamic-import
  chunking warning.
- `pnpm db:generate` after migration generation: no schema changes remaining.
- The docs suite's temporary databases were removed after verification.

Local evidence: `/tmp/opencode/mcp-data-check.log` and
`/tmp/opencode/mcp-data-deploy-check.log`. Actual GitHub access, WorkOS membership
sync, MCP calls, and deployed Worker database behavior remain outside this phase.

## Follow-up: automatic migrations

- Added `Apply database migrations` to `.github/workflows/deploy.yml` between
  Worker validation and deployment, for both main pushes and manual main runs.
- Configured the direct database URL as a GitHub `production` environment secret,
  scoped to the migration step. TLS certificate verification stays enabled;
  the Postgres.js-incompatible `sslrootcert=system` parameter is omitted.
- The existing production concurrency group serializes deployments and migrations.
  A failed migration prevents deploying the new Worker. Applied schema changes
  are not automatically rolled back if a subsequent Worker deployment fails.
- Follow-up checks: `pnpm check` passed (27 tests passed; 10 opt-in Postgres tests
  skipped for this workflow-only change). Parsed the workflow and verified step
  order and secret isolation; executed its migration script with a simulated
  command to verify missing-secret failure, migration-error propagation, and
  successful `pnpm db:migrate` invocation. The production secret was confirmed
  present via GitHub's secret metadata without retrieving its value.
