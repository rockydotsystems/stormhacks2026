# StormHacks 2026

A feature-first hackathon starter using vinext 1.0.1 (Next.js-compatible App Router on Vite), Cloudflare Workers, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 18, Drizzle, TanStack React Query, WorkOS AuthKit, and Awilix. Next.js remains installed for AuthKit peer dependencies, types, and ESLint—not for development, builds, or deployment.

## Local setup

### Managed environment (Nix)

The pinned flake provides Node 24, pnpm 12.0.0, jj, direnv, nix-direnv,
nixfmt, Docker/Compose clients, and PostgreSQL 18 tools. It declares x86_64 and
aarch64 Linux/macOS; only x86_64 Linux has been verified locally. Docker is optional
for Nix development; Compose commands need a running daemon (Docker Desktop on macOS).

Install Nix with `nix-command` and `flakes` enabled, then enter from the repository root:

```sh
direnv allow
# Or, without a shell hook:
nix develop

pnpm install --frozen-lockfile
cp .env.example .env.local
cp .dev.vars.example .dev.vars
nix run .#dev
```

Enable direnv in your host shell for automatic loading: `eval "$(direnv hook bash)"`
in Bash's interactive configuration, `eval "$(direnv hook zsh)"` in `.zshrc`, or
`direnv hook fish | source` in Fish's configuration. For cached loading, enable
your host's nix-direnv integration (on Home Manager, `programs.direnv.enable = true`
and `programs.direnv.nix-direnv.enable = true`). Including nix-direnv in the dev
shell does not itself enable that host integration. Plain direnv's built-in
`use flake` also works, without nix-direnv caching. No shell hook starts services,
installs dependencies, or runs migrations.

`nix run .#dev` starts Nix's PostgreSQL 18 without Docker, creates the local
database, applies committed migrations, and launches the Worker dev server.
Data persists in `.direnv/postgres`; PostgreSQL keeps running across dev-server
restarts, like Compose. To stop it, run
`nix develop -c pg_ctl -D .direnv/postgres -m fast -w stop`.
Both migrations and the Worker use the local database,
regardless of hosted credentials in `.env.local`. Stop Compose Postgres first if
it already occupies port 5432, or set `STORMHACKS_DB_PORT` to another local port.
`pnpm dev` remains a server-only command and requires a database already running.

The dev shell and `nix run` source commands default `NODE_EXTRA_CA_CERTS` to
the pinned Nix CA bundle, preserving an existing override. This lets the local
Worker verify HTTPS connections to WorkOS without a manual environment prefix.
The browser still uses `http://localhost:3000`; TLS verification is not disabled.

### Nix commands

Source commands run from the repository root and reuse `package.json` scripts.
They forward arguments and preserve command failures. Run `install` first.

| Command                                          | Purpose                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `nix run .#install`                              | Install locked dependencies                               |
| `nix run .#dev -- --port 3000`                   | Start local Postgres, migrate, and run the dev server     |
| `nix run .#build`                                | Build the source checkout                                 |
| `nix run .#test -- src/features/auth`            | Run tests, optionally filtered                            |
| `nix run .#lint`                                 | Run ESLint                                                |
| `nix run .#typecheck`                            | Generate Worker binding types and check TypeScript        |
| `nix run .#fmt` / `nix run .#fmt-check`          | Format/check application files and docs with Prettier     |
| `nix fmt flake.nix nix/*.nix`                    | Format Nix files                                          |
| `nix run .#check`                                | Run the existing lint/type/test/format suite              |
| `nix run .#db-up` / `nix run .#db-down`          | Start/stop local Postgres                                 |
| `nix run .#db-generate` / `nix run .#db-migrate` | Generate/apply migrations                                 |
| `nix run .#db-studio`                            | Inspect the database with Drizzle Studio                  |
| `nix run .#start -- --port 3000`                 | Preview the built Worker locally                          |
| `nix run .#deploy-check`                         | Build and dry-run Workers deployment                      |
| `nix run .#deploy`                               | Build and deploy (requires configured account/resources)  |
| `nix run .#worker-types`                         | Regenerate Worker binding types                           |
| `nix flake check`                                | Sandboxed build, source checks, and Nix formatting checks |

`nix build` produces a Cloudflare deployment artifact: `result/server` contains
the Worker/modules and generated Wrangler config; `result/client` contains its
static assets. The deliverable is no longer a standalone Node server, so there is
no default `nix run .` app. Use `nix run .#dev` for development or build the source
checkout and run `nix run .#start` for a production Worker preview.

The package does not include local environment files or secrets and can build
without a database or WorkOS credentials. Runtime secrets belong in Workers
secrets or local `.dev.vars`, never in the Nix store. Future browser use of
`NEXT_PUBLIC_*` values requires a build configured for that origin. Local previews
use workerd via Wrangler, not Node's production server.

After changing `pnpm-lock.yaml`, regenerate the dependency hash in
`nix/package.nix`: temporarily set `hash = ""`, run
`nix build .#default.pnpmDeps --no-link`, and copy the reported `got: sha256-…`
value into `hash`. Dependency retrieval is hash-pinned; application builds install
from that cache offline. Keep `flake.lock` committed; input updates are deliberate.

### Without Nix

Requires Node.js 22.12+ and pnpm 12.0.0, plus Docker with the Compose plugin (Docker Desktop includes it).

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
cp .dev.vars.example .dev.vars
pnpm db:up
pnpm db:migrate
pnpm dev
```

The local dev server uses port 3000. In an Amp orb, use a supervised service and the portal URL it returns instead of exposing a sandbox host directly:

```sh
amp orb service start web --command 'pnpm dev --host 0.0.0.0' --port 3000 --portal
```

The homepage works without WorkOS credentials and shows setup instructions. Protected APIs return 503 until auth is configured; there is no development auth bypass. Once configured, anonymous API requests return 401 JSON instead of redirecting to a login page.

## WorkOS authentication

Use a WorkOS **staging** environment. Set these in `.dev.vars` for the local Worker runtime (keep `.env.local` for Drizzle's direct database URL):

- `WORKOS_API_KEY`: your staging API key.
- `WORKOS_CLIENT_ID`: your application's client ID.
- `WORKOS_COOKIE_PASSWORD`: at least 32 characters; generate with `openssl rand -base64 32`.
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`: your app's origin followed by `/callback`.

In the WorkOS Dashboard, configure these application URLs for your development origin:

| Setting            | Local development value          |
| ------------------ | -------------------------------- |
| Redirect URI       | `http://localhost:3000/callback` |
| Initiate login URI | `http://localhost:3000/login`    |
| Sign-out URI       | `http://localhost:3000`          |

For orb previews, replace the local origin in all three dashboard settings and the redirect environment variable with your portal origin. Restart the dev service after changing environment variables. Only the redirect URI is public; never prefix API keys or cookie passwords with `NEXT_PUBLIC_`.

vinext runs `src/proxy.ts` for AuthKit session handling. Controllers explicitly require authentication before reading or writing data. The AuthKit provider handles session expiry; `/api/auth/session` exposes only public user identity fields, not tokens. Logout is a POST endpoint, not a server action. A full sign-in/callback/sign-out test needs valid credentials and dashboard settings.

### Account settings widgets

The account menu reads WorkOS names, email, and profile images from the session.
`/settings/profile` and `/settings/security` use WorkOS UserProfile, UserSecurity,
and UserSessions widgets with AuthKit's refreshable access token.
`/settings/team` uses UsersManagement for the authenticated organization; it
requires the `widgets:users-table:manage` permission. The dashboard organization
switcher lists active WorkOS memberships and refreshes the AuthKit session when
switching. Projects, documents, and UsersManagement all use the selected WorkOS
organization. New organization creators receive the role configured as the WorkOS
default; configure administrator roles and widget permissions in WorkOS.

In the WorkOS application's Sessions settings, add your exact app origin (for
example `http://localhost:3000`) to the allowed web origins for Widget CORS.
See [WorkOS Widgets setup](https://workos.com/docs/widgets/quick-start).
Use the same hostname for sign-in and the app so the session cookie is available.
No extra credentials are sent to the client. The Log out menu action submits the
existing POST `/api/auth/logout` endpoint.

`/settings/preferences` stores the default document order on the current device,
separately for each signed-in user. Live widget edits and logout verification
require a signed-in WorkOS session; security changes should be verified with a
disposable staging account.

## GitHub integration

Connect an installed GitHub App from `/settings/github` after selecting an
organization. OAuth verifies the connecting user's repository access; installation
tokens refresh enrolled repositories, and signed webhooks record activity and
access changes. WorkOS remains the login provider. See
[GitHub integration](docs/github-integration.md) for registration settings, secrets,
the additive migration, authorization boundaries, and verification.

## Cloudflare Workers deployment

`vite.config.ts` runs vinext's RSC environment in workerd through the stable
Cloudflare Vite plugin v1 and Wrangler v4 integration. `wrangler.jsonc` is the
source configuration; `dist/server/wrangler.json` is generated by the build.
Always deploy the generated config so the bundled Worker and client assets stay
together. No Pages project, OpenNext adapter, or Node server is used.

```sh
pnpm build
pnpm start --port 3000      # Local preview of the built Worker
pnpm deploy:check          # Build + Wrangler dry-run, no remote deployment
```

Before a live deploy:

1. Authenticate with `pnpm exec wrangler login`, or provide `CLOUDFLARE_API_TOKEN`
   and `CLOUDFLARE_ACCOUNT_ID` in your CI credential environment.
2. Configure a hosted PostgreSQL database and a Hyperdrive connection in your
   Cloudflare account. Disable Hyperdrive query caching for user-owned notes so
   a create followed by list does not return a stale cached result. Set the
   Hyperdrive ID in `wrangler.jsonc` for the intended account (the hackathon
   binding is documented below). The deployment script rejects an all-zero
   placeholder before contacting Cloudflare.
3. Apply the committed Drizzle migration to that database from a trusted machine
   using its direct `DATABASE_URL`. Do not run migrations in Worker requests.
4. Store runtime auth configuration with Wrangler's secure interactive prompts:

   ```sh
   pnpm exec wrangler secret put WORKOS_API_KEY
   pnpm exec wrangler secret put WORKOS_CLIENT_ID
   pnpm exec wrangler secret put WORKOS_COOKIE_PASSWORD
   pnpm exec wrangler secret put NEXT_PUBLIC_WORKOS_REDIRECT_URI
   ```

   Set the redirect URI to your Worker/custom-domain origin plus `/callback`, and
   update the WorkOS redirect, initiate-login, and sign-out dashboard URLs to
   match. The default Worker name is `stormhacks2026` on `workers.dev`; no account
   ID or custom domain is assumed. Secrets can create the Worker before its first
   code deployment; configure them in the intended account only.

5. Run `pnpm run deploy` (use `run`: `pnpm deploy` is pnpm's workspace deployment
   command). Then verify sign-in, create/list notes, and sign-out at the real URL.

Local Hyperdrive uses PostgreSQL on `127.0.0.1:5432`, without a remote
connection or Cloudflare credentials. Override it with
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` when needed. Neither
the all-zero ID nor local credentials identify a production resource. No
production migration or remote resource provisioning is automated.
vinext is under active development; build success and dry-run do not prove a
real WorkOS callback or deployed database integration.

### PlanetScale Postgres and Drizzle

The hackathon database is PlanetScale **Postgres**, accessed by the Worker through
Hyperdrive `stormhacks2026-postgres` (`bf80c69856e7404faf3d55e5b5d29a82`). Query
caching is disabled and the origin connection limit is 20. This binding belongs
to the configured hackathon Cloudflare account; forks must supply their own ID.
The existing Drizzle PostgreSQL schema and Postgres.js driver are retained.

Run migrations directly against PlanetScale, not through Hyperdrive:

```sh
pnpm db:migrate
```

The command reads the direct `DATABASE_URL` from your ignored `.env.local`.
Use `sslmode=verify-full` for certificate-verified TLS. For Postgres.js, omit
PlanetScale's `sslrootcert=system` URL parameter: the driver forwards it as an
unsupported server setting. Node's trusted CA roots are used with `verify-full`;
do not disable certificate verification. The committed migration creates the
`notes` table and its owner/time index.

Local Workers still use the loopback connection in `localConnectionString`.
Changing `.env.local` changes the migration target, not the Worker binding.
Never point `TEST_DATABASE_URL` at the hosted hackathon database.

GitHub's `production` environment contains the Cloudflare deployment credentials
and the direct Postgres `DATABASE_URL`, and allows only the `main` branch. After
checks and build validation, CI applies committed Drizzle migrations before
deploying the Worker. A missing database secret or failed migration stops the
deployment. WorkOS runtime secrets must be configured separately.

Local provisioning credentials are in ignored `.env.cloudflare.local`, separate
from the migration URL in `.env.local`. Load the Cloudflare file explicitly into
your command environment when provisioning; neither file belongs in version
control or build artifacts.

For teardown, remove the named Hyperdrive configuration, the PlanetScale database
in its dashboard, any deployed `stormhacks2026` Worker, and the GitHub production
credentials. Deleting Hyperdrive does not delete the PlanetScale database.

### GitHub Actions with Blacksmith

`.github/workflows/deploy.yml` deploys on pushes to `main` and supports manual
runs from **Actions → Deploy Worker → Run workflow**. Manual runs must select
`main`; other branches are skipped. Deployments are serialized without cancelling
an in-progress deployment.

Before publishing the workflow:

1. Install the [Blacksmith GitHub integration](https://app.blacksmith.sh) for
   `rockydotsystems` and enable access to this repository. The workflow uses
   `blacksmith-2vcpu-ubuntu-2404` runners.
2. Create a GitHub **production** environment. Restrict its deployment branches
   to `main` and configure required reviewers if you want an approval gate.
3. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `DATABASE_URL` as environment secrets.
   Use an **Edit Cloudflare Workers** API token scoped to the intended account
   and the permissions required by its bindings. Use the direct Postgres URL,
   not Hyperdrive, with migration permissions and `sslmode=verify-full`; omit
   `sslrootcert=system` for Postgres.js compatibility.
4. Complete the live-deploy prerequisites above: replace the Hyperdrive
   placeholder in `wrangler.jsonc`, ensure the migration credential can apply
   schema changes, and provision the WorkOS Worker secrets and dashboard URLs.
   CI applies the database migrations. Runtime auth secrets stay in Cloudflare,
   not the workflow or build environment.

The job installs the locked dependencies with Node 24 and the pnpm version in
`package.json`, runs `pnpm check`, then `pnpm deploy:check`. Only after those
pass does it run `pnpm db:migrate` and deploy that same build through
`scripts/deploy.mjs`, preserving the Hyperdrive placeholder guard and generated
`dist/server/wrangler.json` config. The database URL is exposed only to the
migration step; Cloudflare credentials are exposed only to the final deployment
step. pnpm's dependency cache uses Blacksmith's colocated cache through
`actions/setup-node`.

Every main push and manual main deployment checks for pending committed
migrations. Drizzle records applied migrations, so repeats do not reapply them.
The production concurrency group serializes the migrate/deploy sequence. Review
migrations before pushing; keep them compatible with the currently deployed
Worker, since schema changes happen before the new Worker is published. If a
deployment fails after a successful migration, the schema changes remain; there
is no automatic database rollback.

Adding the workflow does not publish it or configure remote resources. Once the
prerequisites are ready, publishing it to `main` triggers the first deployment.

### Public domains

The Worker serves `https://whydidwechoosethis.tech` through the custom domain in
`wrangler.jsonc`; deployment manages its DNS record and certificate.
`wdwct.tech` has a proxied, originless `AAAA` record pointing to `100::` and a
Cloudflare Single Redirect to the primary HTTPS domain. The redirect returns
301 and preserves the path and query string. Only these apex hostnames are
configured; `www` aliases are not included.

The redirect ruleset payload is `cloudflare/wdwct-redirect.json`. It is managed
separately from Worker deployment. To provision it on a fresh zone without an
existing `http_request_dynamic_redirect` entry point, load your Cloudflare
credentials and run:

```sh
cf rulesets account-rulesets create --zone wdwct.tech --body @cloudflare/wdwct-redirect.json
```

If a redirect entry point already exists, add or update only this rule rather
than replacing unrelated rules. Keep the secondary DNS record proxied so the
redirect executes at Cloudflare's edge. During teardown, remove the redirect
rule/owned ruleset and secondary DNS record, as well as the Worker's custom
domain and its generated certificate. Do not delete either zone or unrelated
DNS records.

For WorkOS, the canonical redirect URI is
`https://whydidwechoosethis.tech/callback`; initiate login at `/login` and sign
out to the canonical origin. Deployment alone does not configure WorkOS.

## Architecture

```text
src/
  app/                      # App Router pages, providers, thin API route adapters
    api/auth/               # Session and logout endpoints
    api/notes/              # GET and POST example endpoints
    callback/               # WorkOS callback
    login/                  # WorkOS hosted login entry point
  features/
    auth/
      client/               # React Query session hook
      components/           # Session-aware starter UI
      server/               # Auth configuration, service, controller
      contracts.ts          # Client-safe session DTO
    notes/
      client/               # Query and mutation hooks
      components/           # Feature UI
      server/               # Drizzle schema, service, controller, tests
      contracts.ts          # Zod request schema and response DTOs
  lib/api-client.ts         # Browser JSON API client
  server/                   # Request-scoped DB clients, DI container, HTTP errors
drizzle/                    # Committed SQL migrations and schema snapshots
```

The example notes feature demonstrates this flow:

```text
React component → React Query → /api/notes → NotesController → NotesService → Drizzle → Hyperdrive → Postgres
```

- **Components** handle UI and local state. React Query handles remote state, caching, mutations, and invalidation. No browser code accesses the database; no server actions manage application data.
- **Contracts** are safe to import on both sides. Use Zod at the API boundary and JSON-friendly DTOs (dates are strings).
- **Controllers** authenticate, validate requests, call services, and construct HTTP responses. Return 400 for invalid input, 401 for anonymous requests, and generic 500 errors for unexpected failures.
- **Services** own business rules and Drizzle queries. User-owned operations take the authenticated user ID explicitly, never a client-supplied owner ID.
- **Awilix** uses explicit registrations, PROXY injection, and strict lifetime checks. `handleApi` creates/disposes a scope per request. Services, controllers, and database clients are scoped. A database client is created lazily and closed on disposal, including API failures. Hyperdrive owns the remote pool; never reuse Worker sockets between requests or put user state in singleton services.
- **Server-only boundaries** prevent DB, auth, and DI code from leaking into client bundles. Drizzle schema files omit `server-only` so the migration CLI can read them; browser code imports contracts, not schemas.

To add a feature, follow `notes`: add contracts, schema, service, controller, hooks, and components; register its service/controller in `src/server/container.ts`; add a thin `src/app/api/<feature>/route.ts` using `handleApi`. Keep domain code inside its feature rather than global controller/service folders.

## UI system

[Coss UI](https://coss.com/ui/docs) supplies local Base UI primitives in `src/components/ui`. Button, Card, Label, Textarea, and Spinner are installed; add other components on demand:

```sh
pnpm dlx shadcn@latest add @coss/dialog
```

`components.json` configures the Coss registry, import aliases, and Phosphor icon preference. Coss registry sources can still contain Lucide imports; replace those with matching [Phosphor](https://phosphoricons.com/) icons after adding a component. Import individual icons from `@phosphor-icons/react/dist/csr/<Name>` in Client Components and `@phosphor-icons/react/dist/ssr/<Name>` in Server Components (for example, `PlusIcon` from `@phosphor-icons/react/dist/csr/Plus`). Direct imports avoid compiling thousands of unused icons during development. Decorative icons should have `aria-hidden="true"`; icon-only buttons need an accessible label.

The Coss neutral surface system and **teal primary brand** are defined in `src/app/globals.css`. Use semantic classes such as `bg-primary`, `text-primary-foreground`, and `text-muted-foreground` rather than palette overrides. Light mode uses teal-700 with white text; the `.dark` theme uses teal-400 with teal-950 text. Apply `.dark` to the root element to opt into dark mode. System font fallbacks are retained; no font downloads are required.

Both upstream agent skills are included in `.agents/skills`: `using-coss-ui` (component references and rules) and `using-coss-particles` (the full particle catalog). Imported from [cosscom/coss](https://github.com/cosscom/coss/tree/dd49ec9c2c268ae751724ddc64b343cb3a7e773b/apps/ui/skills), under MIT, with project-specific icon/theme guidance and the particle index moved into a reference file for progressive loading.

## Database workflow

The TypeScript MCP app is in `apps/mcp`; the web app remains at the root. Shared
data services live in `packages/data`. See [MCP server](docs/mcp-server.md) for
tools, human OAuth sign-in, local development, and deployment prerequisites.

The organization/project-scoped docs foundation, snapshot/publication rules, service
operations, and MCP integration boundary are documented in
[`docs/mcp-data-layer.md`](docs/mcp-data-layer.md).

Docker Compose binds Postgres to loopback and persists data in a named volume. Its hardcoded credentials are **local development defaults only**. Use a managed database, private networking, and separate secrets in production.

```sh
pnpm db:up         # Start Postgres and wait for its health check
pnpm db:generate   # After changing a feature's server/schema.ts
pnpm db:migrate    # Apply committed SQL migrations
pnpm db:studio     # Inspect the local database
pnpm db:down       # Stop Postgres; retain the volume
```

Commit generated SQL and `drizzle/meta` together. Review migrations before applying them outside local development. Database commands read `.env.local`, then `.env`, without overriding existing environment variables. To erase local data intentionally, `docker compose down -v` removes the volume; this is destructive.

## Verification

```sh
pnpm check         # ESLint, TypeScript, unit/API tests, Prettier
pnpm build         # Production build; no DB or WorkOS secrets needed
```

Tests cover authentication failure modes, input boundaries, forged ownership, JSON errors, and request-scope isolation. The real Postgres test is opt-in; migrate a disposable local/test database first, then run:

```sh
TEST_DATABASE_URL=postgres://stormhacks:stormhacks@localhost:5432/stormhacks pnpm test
```

Never point `TEST_DATABASE_URL` at production. The integration test inserts records with unique test owners and deletes only those records afterward.
