# StormHacks 2026

**WhyDidWeChooseThis.Tech** keeps project decisions, documents, and the conversations
behind them in one place. Ask questions about past decisions or connect an AI
client through MCP.

Built with React, TypeScript, vinext/Vite, Cloudflare Workers, Postgres, and WorkOS.

## Get started

Run these commands from the repository root. Use the pinned Nix environment
(Node 24 and pnpm 12):

```sh
nix develop
pnpm install --frozen-lockfile
cp .env.example .env.local
cp .dev.vars.example .dev.vars
nix run .#dev
```

Open **http://localhost:3000**. The last command starts local Postgres, applies
migrations, and starts the app. You can use `direnv allow` instead of `nix develop`
if your shell has direnv enabled.

**Without Nix:** install Node 24, pnpm 12, and Docker Compose. Run the same install
and copy commands, then `pnpm db:up`, `pnpm db:migrate`, and `pnpm dev`.

## Configure sign-in and AI

Edit `.dev.vars` for local runtime settings:

- **Sign-in:** set `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and
  `WORKOS_COOKIE_PASSWORD` (generate with `openssl rand -base64 32`). Use a WorkOS
  staging environment and register `http://localhost:3000/callback` as its redirect
  URI, `/login` as the initiate-login path, and the local origin as its sign-out URL.
- **AI:** set `OPENROUTER_API_KEY`; the example file includes the model setting.
- **Voice (optional):** set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.

Restart the app after changing settings. Without WorkOS credentials, the app shows
setup instructions; protected APIs stay unavailable.

Keep migration credentials in `.env.local` and runtime secrets in `.dev.vars`.
Neither file belongs in version control.

## Common commands

| Command             | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Start the app with an already-running database  |
| `pnpm check`        | Run lint, type, test, and formatting checks     |
| `pnpm build`        | Build the Worker                                |
| `pnpm start`        | Preview the built Worker locally                |
| `pnpm deploy:check` | Build and dry-run deployment without publishing |
| `pnpm db:generate`  | Generate a migration after schema changes       |
| `pnpm db:migrate`   | Apply migrations to the configured database     |
| `pnpm db:studio`    | Open the database browser                       |

Review migrations before applying them. Use only a disposable database for
`TEST_DATABASE_URL`, never production.

## More details

- [Development reference](docs/development-reference.md): Nix, authentication,
  deployment, architecture, and database workflows.
- [MCP server](docs/mcp-server.md): connect AI clients and run the MCP Worker.
- [GitHub integration](docs/github-integration.md): connect repositories.
- [Data model](docs/mcp-data-layer.md): projects, documents, and change history.
- [Collaboration](docs/collaboration.md) and [voice conversations](docs/document-voice.md).

Deployments use Cloudflare Workers, not a Node server. Read the deployment
prerequisites in the development reference before running `pnpm run deploy`.
