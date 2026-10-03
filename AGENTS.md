<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Development environment

Use the pinned Nix flake and direnv (`direnv allow`) or `nix develop`.
Node 24, pnpm 12.0.0, and nixfmt are approved project tooling. Format Nix
with `nix fmt`; retain Prettier for the existing application and documentation.
Run source apps from the repository root; see README for build and check commands.

Canonical repository: https://github.com/rockydotsystems/stormhacks2026
For this organization-owned project, try the private skill catalog for co.codes
repository `0xhckr/agents-rockydotsystems`, ref `main`, path `index.json`, using
authenticated access. Load relevant skills alongside the shared catalog when
available. Discovery was unchecked during setup because no live read grant was
available. Never persist credentials here. Routing contract:
https://co.codes/t:a/0xhckr/agents/docs/private-libraries.md?ref=main
