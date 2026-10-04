import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const configPath = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
const hyperdrive = config.hyperdrive?.find(
  (binding) => binding.binding === "HYPERDRIVE",
);

if (!hyperdrive?.id || /^0+$/.test(hyperdrive.id)) {
  console.error(
    "Set a real HYPERDRIVE ID in wrangler.jsonc before deploying. Use pnpm deploy:check for a local dry-run.",
  );
  process.exit(1);
}

function wrangler(args) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
      ),
      "deploy",
      ...args,
    ],
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
  }
  return result.status ?? 1;
}

// The app binds to the realtime Worker's Durable Object, so that Worker must exist first.
const realtime = wrangler([
  "--config",
  "apps/realtime/wrangler.jsonc",
  ...process.argv.slice(2),
]);
if (realtime !== 0) process.exit(realtime);

process.exit(wrangler(["--config", configPath, ...process.argv.slice(2)]));
