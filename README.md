# StormHacks 2026

A feature-first hackathon starter using Next.js 16.3.8 (latest stable when scaffolded), React 19, TypeScript, Tailwind CSS 4, PostgreSQL 18, Drizzle, TanStack React Query, WorkOS AuthKit, and Awilix.

## Local setup

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
