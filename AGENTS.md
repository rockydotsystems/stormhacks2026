<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Development environment

Use lowercase Conventional Commit messages, including the type, optional scope,
and description (for example, `perf(dev): avoid compiling unused icons`).

Use the pinned Nix flake and direnv (`direnv allow`) or `nix develop`.
Node 24, pnpm 12.0.0, and nixfmt are approved project tooling. Format Nix
with `nix fmt`; retain Prettier for the existing application and documentation.
Run source apps from the repository root; see README for build and check commands.

## Version-control safety

Use jj with repository-local automatic abandonment disabled:

```sh
jj config set --repo git.abandon-unreachable-commits false
```

Check this setting before fetching or importing Git refs in an existing or new
checkout. Deleted remote branches must not automatically abandon local commits
and rebase their descendants. Retire obsolete revisions explicitly only after
verifying that their work is preserved.

Run `jj git fetch` and `jj git import` sequentially, never alongside other jj
commands in any workspace sharing this repository. Even `jj status` and `jj log`
can import Git refs in a colocated checkout. Coordinate fetch/import with the
shared `.jj/repo/agent-workspaces/integration.lock`; stop if another owner holds it.
After fetching, inspect bookmarks and the graph before moving local `main`.
Preserve both clean tips when local and remote history diverge; do not rebase
published collaboration commits or resolve a bookmark by dropping either side.

## Runtime and deployment

Use vinext/Vite for the Next-compatible App Router and Cloudflare Workers for
deployment. `pnpm dev`, `pnpm build`, and `pnpm start` target workerd; do not
switch back to `next dev`/`next build` or restore standalone Node packaging.
Keep Next.js for AuthKit peers/types/ESLint. Consult installed vinext and
Cloudflare plugin documentation as well as the relevant Next API guide.
Run `pnpm check` and `pnpm deploy:check` before completing runtime changes.
`pnpm run deploy` publishes; do not run it without explicit deployment approval.
Postgres clients must be request-scoped and disposed; Hyperdrive owns the pool.
The all-zero Hyperdrive ID is local-only and must be replaced before deployment.
Use `.dev.vars` for local Worker secrets, `.env.local` for migration credentials.

Canonical repository: https://github.com/rockydotsystems/stormhacks2026
For this organization-owned project, try the private skill catalog for co.codes
repository `0xhckr/agents-rockydotsystems`, ref `main`, path `index.json`, using
authenticated access. Load relevant skills alongside the shared catalog when
available. Discovery was unchecked during setup because no live read grant was
available. Never persist credentials here. Routing contract:
https://co.codes/t:a/0xhckr/agents/docs/private-libraries.md?ref=main
