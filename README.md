# StormHacks 2026

A feature-first hackathon starter using Next.js 16.3.8 (latest stable when scaffolded), React 19, TypeScript, Tailwind CSS 4, PostgreSQL 18, Drizzle, TanStack React Query, WorkOS AuthKit, and Awilix.

## Local setup

### Managed environment (Nix)

The pinned flake provides Node 24, pnpm 12.0.0, jj, direnv, nix-direnv,
nixfmt, Docker/Compose clients, and PostgreSQL 18 tools. It declares x86_64 and
aarch64 Linux/macOS; only x86_64 Linux has been verified locally. Docker still
needs a running daemon (Docker Desktop on macOS).

Install Nix with `nix-command` and `flakes` enabled, then enter from the repository root:

```sh
direnv allow
# Or, without a shell hook:
nix develop

pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm dev
```

Enable direnv in your host shell for automatic loading: `eval "$(direnv hook bash)"`
in Bash's interactive configuration, `eval "$(direnv hook zsh)"` in `.zshrc`, or
`direnv hook fish | source` in Fish's configuration. For cached loading, enable
your host's nix-direnv integration (on Home Manager, `programs.direnv.enable = true`
and `programs.direnv.nix-direnv.enable = true`). Including nix-direnv in the dev
shell does not itself enable that host integration. Plain direnv's built-in
`use flake` also works, without nix-direnv caching. No shell hook starts services,
installs dependencies, or runs migrations.

### Nix commands

Source commands run from the repository root and reuse `package.json` scripts.
They forward arguments and preserve command failures. Run `install` first.

| Command                                          | Purpose                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `nix run .#install`                              | Install locked dependencies                               |
| `nix run .#dev -- --port 3000`                   | Start the development server                              |
| `nix run .#build`                                | Build the source checkout                                 |
| `nix run .#test -- src/features/auth`            | Run tests, optionally filtered                            |
| `nix run .#lint`                                 | Run ESLint                                                |
| `nix run .#typecheck`                            | Generate route types and check TypeScript                 |
| `nix run .#fmt` / `nix run .#fmt-check`          | Format/check application files and docs with Prettier     |
| `nix fmt flake.nix nix/*.nix`                    | Format Nix files                                          |
| `nix run .#check`                                | Run the existing lint/type/test/format suite              |
| `nix run .#db-up` / `nix run .#db-down`          | Start/stop local Postgres                                 |
| `nix run .#db-generate` / `nix run .#db-migrate` | Generate/apply migrations                                 |
| `nix run .#db-studio`                            | Inspect the database with Drizzle Studio                  |
| `nix flake check`                                | Sandboxed build, source checks, and Nix formatting checks |

`nix build` produces the actual standalone Next.js application in `result`,
including public and static assets. `nix run .` starts that built production
server, not the development server. Configure its bind address and port through
environment variables:

```sh
HOSTNAME=127.0.0.1 PORT=3000 nix run .
```

The package does not include local environment files or secrets and can build
without a database or WorkOS credentials. Supply runtime server configuration
through exported environment variables; do not expect the packaged server to load
the checkout's `.env.local`. `NEXT_PUBLIC_*` values are compiled into browser
bundles at build time; the current redirect URI is consumed by server auth code,
but future browser use needs an explicitly configured rebuild. Use writable
checkout builds for development; the Nix store is immutable and is not a writable
runtime cache for future ISR/image-cache features.

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
pnpm db:up
pnpm db:migrate
pnpm dev
```

The local dev server uses port 3000. In an Amp orb, use a supervised service and the portal URL it returns instead of exposing a sandbox host directly:

```sh
amp orb service start web --command 'pnpm dev --hostname 0.0.0.0' --port 3000 --portal
```

The homepage works without WorkOS credentials and shows setup instructions. Protected APIs return 503 until auth is configured; there is no development auth bypass. Once configured, anonymous API requests return 401 JSON instead of redirecting to a login page.

## WorkOS authentication

Use a WorkOS **staging** environment. Set these in `.env.local`:

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

Next.js `src/proxy.ts` runs AuthKit session handling. Controllers explicitly require authentication before reading or writing data. The AuthKit provider handles session expiry; `/api/auth/session` exposes only public user identity fields, not tokens. Logout is a POST endpoint, not a server action. A full sign-in/callback/sign-out test needs valid credentials and dashboard settings.

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
  server/                   # Server-only DB pool, DI container, HTTP errors
drizzle/                    # Committed SQL migrations and schema snapshots
```

The example notes feature demonstrates this flow:

```text
React component → React Query → /api/notes → NotesController → NotesService → Drizzle → Postgres
```

- **Components** handle UI and local state. React Query handles remote state, caching, mutations, and invalidation. No browser code accesses the database; no server actions manage application data.
- **Contracts** are safe to import on both sides. Use Zod at the API boundary and JSON-friendly DTOs (dates are strings).
- **Controllers** authenticate, validate requests, call services, and construct HTTP responses. Return 400 for invalid input, 401 for anonymous requests, and generic 500 errors for unexpected failures.
- **Services** own business rules and Drizzle queries. User-owned operations take the authenticated user ID explicitly, never a client-supplied owner ID.
- **Awilix** uses explicit registrations, PROXY injection, and strict lifetime checks. `handleApi` creates/disposes a scope per request. Services and controllers are scoped; the database pool is shared. Do not put request identity or mutable user state in singleton services.
- **Server-only boundaries** prevent DB, auth, and DI code from leaking into client bundles. Drizzle schema files omit `server-only` so the migration CLI can read them; browser code imports contracts, not schemas.

To add a feature, follow `notes`: add contracts, schema, service, controller, hooks, and components; register its service/controller in `src/server/container.ts`; add a thin `src/app/api/<feature>/route.ts` using `handleApi`. Keep domain code inside its feature rather than global controller/service folders.

## UI system

[Coss UI](https://coss.com/ui/docs) supplies local Base UI primitives in `src/components/ui`. Button, Card, Label, Textarea, and Spinner are installed; add other components on demand:

```sh
pnpm dlx shadcn@latest add @coss/dialog
```

`components.json` configures the Coss registry, import aliases, and Phosphor icon preference. Coss registry sources can still contain Lucide imports; replace those with matching [Phosphor](https://phosphoricons.com/) icons after adding a component. Use `@phosphor-icons/react` in Client Components and `@phosphor-icons/react/ssr` in Server Components. Decorative icons should have `aria-hidden="true"`; icon-only buttons need an accessible label.

The Coss neutral surface system and **teal primary brand** are defined in `src/app/globals.css`. Use semantic classes such as `bg-primary`, `text-primary-foreground`, and `text-muted-foreground` rather than palette overrides. Light mode uses teal-700 with white text; the `.dark` theme uses teal-400 with teal-950 text. Apply `.dark` to the root element to opt into dark mode. System font fallbacks are retained; no font downloads are required.

Both upstream agent skills are included in `.agents/skills`: `using-coss-ui` (component references and rules) and `using-coss-particles` (the full particle catalog). Imported from [cosscom/coss](https://github.com/cosscom/coss/tree/dd49ec9c2c268ae751724ddc64b343cb3a7e773b/apps/ui/skills), under MIT, with project-specific icon/theme guidance and the particle index moved into a reference file for progressive loading.

## Database workflow

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
