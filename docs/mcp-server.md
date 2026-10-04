# MCP server

`apps/mcp` is a separate TypeScript Cloudflare Worker exposing authenticated,
stateless Streamable HTTP at `/mcp`. The web app stays at the repository root;
both apps use the `@stormhacks/data` workspace package and the root `drizzle/`
migrations. The official MCP TypeScript SDK's Web Standard HTTP transport needs
no Express server, persistent MCP sessions, or Durable Objects.

## Tools

| Tool                       | Arguments                   | Result                                                                                                       |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `list_organizations`       | Pagination                  | Active organization memberships available to the signed-in person                                            |
| `get_current_organization` | Optional `organizationId`   | Signed-in user ID and selected organization                                                                  |
| `list_projects`            | Pagination                  | Projects in that organization                                                                                |
| `list_docs`                | `projectId`, pagination     | Stable doc identities in the project                                                                         |
| `get_doc_metadata`         | `docId`                     | Ownership, creation time, latest title/change/time, change/version counts, latest version, unpublished state |
| `list_changes`             | `docId`, pagination         | Change metadata, display numbers, proposed and immutable flags; no content bodies                            |
| `get_change`               | `docId`, `changeId`         | Full title/content snapshot and change metadata                                                              |
| `list_repositories`        | `projectId`, pagination     | Repositories shared by the project's docs                                                                    |
| `list_versions`            | `docId`, pagination         | Permanent published versions                                                                                 |
| `get_version`              | `docId`, `number`           | Published title/content; `number: 1` reads `v1`                                                              |
| `delete_change`            | `docId`, `changeId`         | Deletes only a non-immutable change                                                                          |
| `propose_change`           | `docId`, `title`, `content` | Appends a full snapshot marked `proposed: true`                                                              |

Tool results include `structuredContent: { data: ... }` and equivalent JSON text.
All tools except `list_organizations` accept an optional `organizationId` from
that list. It is required for accounts with multiple active memberships. With
one membership, omission selects that organization. Selection is checked against
fresh memberships on every request; it is not saved between calls. An account
without memberships can discover an empty list but cannot use scoped tools.
List tools return `{ items, nextOffset }` inside `data`. Pagination uses `offset`
(default 0) and `limit` (default 50, maximum 100); database queries fetch at most
`limit + 1` rows. Continue with `nextOffset` until it is null. Concurrent writes
or deletions can shift offset pages; refetch when history changes.

Doc/project IDs are UUIDs. Change IDs are decimal strings representing stable
bigint IDs, **not display change numbers**. Display numbers are computed and can
shift after deletion. Latest metadata is computed from the remaining snapshots,
so deleting the newest draft reveals the previous title/time. Empty history has
null latest fields and zero changes.

There is deliberately **no permanent-version publication tool**. Proposals do
not freeze any history or create `v1`/`v2`. They are immutable as snapshots (edits
append another snapshot), but can be deleted while beyond the published boundary.
Explicit publication through the existing data service freezes the target and
all preceding snapshots, including proposals. `proposed` records the snapshot's
origin; it remains true after publication. There is no approve/reject workflow
or status-toggle API in this phase. Retrying a proposal creates another snapshot;
it is not idempotent. Proposal inputs allow up to 1,000 title characters and
1,000,000 content characters, subject to the transport's 1.1 MB body limit.

## Person sign-in

Sign-in is the MCP client's browser OAuth flow, **not a tool accepting credentials**.
An unauthenticated `/mcp` request returns `401` with a `WWW-Authenticate` challenge
pointing to `/.well-known/oauth-protected-resource/mcp`. Discovery metadata is
also available at `/.well-known/oauth-protected-resource`.

The resource metadata advertises WorkOS AuthKit Connect as the authorization
server. AuthKit owns authorization, consent, PKCE, refresh tokens and client
registration. This Worker verifies RS256 JWT signatures using the configured
issuer's `/oauth2/jwks`, checks the exact issuer and MCP URL audience, expiry,
and required claims, and accepts only human `user_` subjects with a consent `sid`.
It does not accept web session cookies, web-client audiences, unsigned tokens,
or machine-to-machine credentials. JWT verification needs no client secret;
organization membership checks require the environment's `WORKOS_API_KEY`.

On every authenticated request, the Worker resolves active WorkOS memberships
from the verified user ID and mirrors the organizations into Postgres. Discovery
works with zero or multiple memberships. Scoped tools require an explicit
organization selection when membership is ambiguous and reject nonmember IDs.
No tools accept user IDs as identity inputs; organization IDs select only among
verified memberships. All project/doc operations enforce the organization
boundary through shared services. Roles remain equal, as in the data layer.

Signing in does not create an organization or grant membership. The user must
already have an active WorkOS organization membership to access projects. `org_id` in a
token is not treated as proof of authorization. There is no sign-in bypass for
local development.

The configured resource origin also guards host/DNS rebinding. Browser `Origin`
headers are denied unless explicitly allowed in `MCP_ALLOWED_ORIGINS`; native
clients without an Origin header can connect. Responses are not cached. Each
authenticated request gets fresh services and a request-scoped Postgres client,
closed in `finally`, including authorization and protocol failures. Only public
JWKS/configuration is cached globally; identities and DB connections are not.

## Local setup

From the repository root, use the pinned Nix environment:

```sh
nix develop
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
cp apps/mcp/.dev.vars.example apps/mcp/.dev.vars
# Set the real AuthKit Connect domain and local resource URL in that file.
pnpm mcp:dev
```

The local database defaults to the same Postgres as the web app. Direct migration
credentials stay in root `.env.local`; Worker configuration stays in ignored
`apps/mcp/.dev.vars`. Do not copy root web session secrets into the MCP app.

Before connecting an OAuth-capable MCP client:

1. In WorkOS **Connect → Configuration**, enable Client ID Metadata Documents
   (CIMD), and optionally Dynamic Client Registration (DCR) for older clients.
2. Register the exact `MCP_RESOURCE_URL` as a Resource Indicator, including `/mcp`.
   For local development this is `http://localhost:3001/mcp`; WorkOS must permit
   that resource in the chosen environment. Use an HTTPS development endpoint
   if the environment requires it.
3. Optionally set that resource as default for clients omitting the `resource`
   parameter. The Worker never falls back to the environment's web client ID.
4. Ensure the signing-in user has an active WorkOS organization membership.
5. Configure the MCP client with the remote HTTP URL and complete its browser
   authorization flow. Its OAuth callback belongs to the **client**, not this app.
6. Call `list_organizations`, then pass the selected `organizationId` to scoped
   tools if the account has multiple memberships.

See [WorkOS MCP auth](https://workos.com/docs/authkit/mcp) and
[Connect claims](https://workos.com/docs/authkit/connect/token-claims) for the
current configuration contract. Older clients without protected-resource
discovery are not supported by a legacy metadata proxy in this phase.

## Validation and deployment

```sh
pnpm check
pnpm deploy:check            # Existing web Worker build/dry-run
pnpm mcp:build               # MCP Worker build/dry-run; does not publish
pnpm mcp:smoke               # Real local workerd discovery/auth boundary checks
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/postgres pnpm test
```

Real Postgres tests create/drop only uniquely named `docs_test_*`,
`projects_test_*` and `mcp_test_*` databases; the test database user needs CREATEDB.
Without `TEST_DATABASE_URL`, those tests are skipped. MCP integration tests use
the real SDK client over Streamable HTTP and real database services. The JWTs
and JWKS are generated locally, not issued by WorkOS. The smoke runs the actual
Worker in workerd without accessing remote auth or a database.

`0004_proposed_snapshots.sql` adds `doc_changes.proposed NOT NULL DEFAULT false`,
after the dashboard's `0003_quiet_randall_flagg.sql` project-description migration.
Existing snapshots retain their content, IDs and publication history. It is an
additive migration and leaves append-only/publication guards active.

The existing main deployment workflow validates the MCP build/smoke but still
deploys **only the web Worker**. It applies root database migrations before that
deployment. A separate MCP deployment requires approval, the production AuthKit
issuer/resource configuration, registered resource URL, and the same authorized
Hyperdrive binding. Its config reuses the existing binding with query caching
disabled for read-after-write consistency. Set configuration as Worker secrets
or explicit deployment variables before invoking the app's `deploy` script.
There is no automatic MCP publication yet.

### Hosted endpoint

The MCP Worker configuration serves `https://mcp.whydidwechoosethis.tech/mcp`
through a Cloudflare Custom Domain in the existing rocky.systems account. The
web Worker uses the same `MCP_RESOURCE_URL` for personal setup commands. The MCP
Worker's `workers.dev` route is disabled; its resource origin is the custom domain.

Authentication uses the same WorkOS staging environment as the deployed web app,
with issuer `https://great-shell-53-staging.authkit.app`. Connect has CIMD and DCR
enabled, and the exact MCP endpoint is registered as the default Resource
Indicator. Keep the staging identity environment until a separate production
identity migration is explicitly planned.

The MCP Worker also needs a `WORKOS_API_KEY` secret from that environment to
check active organization memberships. It does not need the web cookie password,
client secret, GitHub secrets, or AI-provider credentials. Store the key using
Wrangler's secure secret input; never add it to configuration or documentation.

Deploy the MCP Worker explicitly from the repository root with
`pnpm --filter @stormhacks/mcp run deploy`, then deploy the web Worker with
`pnpm run deploy`. Use the intended Cloudflare account credentials and preserve
existing remote variables with `--keep-vars` when deploying from an environment
that manages additional dashboard variables. Both commands publish and require
deployment approval. The existing CI workflow still deploys only the web Worker.

## Implementation record

- Extracted transport-independent schemas/contracts/services into `packages/data`;
  existing web paths remain compatibility exports with server-only service guards.
- Added the proposed-snapshot migration, shared read-by-ID and metadata methods,
  and optional database pagination without changing existing unpaged callers.
- Added 11 MCP tools, stateless HTTP transport, OAuth resource discovery,
  human-token verification, single-org resolution, origin controls and disposal.
- Added real-Postgres SDK-client integration tests, signed-JWT negative tests,
  legacy-upgrade assertions, and a workerd smoke script. Extended the Nix source
  closure/dependency hash and CI validation for the workspace layout.
- Fixed a discovered SQL correlation issue: immutable summaries explicitly
  qualify the outer doc-change reference, so another doc's newer publication
  cannot incorrectly mark this doc's drafts immutable. A regression test covers it.

Hosted WorkOS browser sign-in and authenticated tool calls require a real user
to complete consent in their coding agent; discovery and deployment checks alone
do not prove that flow.

Local verification passed: all 60 tests with real Postgres enabled, web and MCP
Worker build/dry-runs, the workerd smoke, and Nix source/application checks.
The populated legacy-upgrade test preserves published history and defaults
existing snapshots to `proposed: false`; all test-created databases were removed.
