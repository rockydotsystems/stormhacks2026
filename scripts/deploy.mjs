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

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
    ),
    "deploy",
    "--config",
    configPath,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
