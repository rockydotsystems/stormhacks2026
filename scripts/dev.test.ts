import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function run(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "stormhacks-dev-"));
  directories.push(directory);
  mkdirSync(join(directory, "node_modules"));
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const trace = join(directory, "trace");
  const stub = `#!/usr/bin/env bash
set -eu
name="$(basename "$0")"
echo "$name $*" >> "$TRACE"
case "$name" in
  pg_ctl)
    if [[ "$*" == *status* ]]; then exit "\${DATABASE_RUNNING:-1}"; fi
    ;;
  psql) echo "\${DATABASE_EXISTS:-}" ;;
  pnpm)
    echo "migration=$DATABASE_URL worker=$CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE" >> "$TRACE"
    if [[ "$1" == db:migrate ]]; then exit "\${MIGRATION_STATUS:-0}"; fi
    exit "\${APP_STATUS:-0}"
    ;;
esac
`;
  for (const command of ["initdb", "pg_ctl", "psql", "createdb", "pnpm"]) {
    writeFileSync(join(bin, command), stub, { mode: 0o755 });
  }
  let status = 0;
  try {
    execFileSync("bash", [resolve("scripts/dev.sh"), "--port", "3010"], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TRACE: trace,
        DATABASE_URL: "postgres://hosted.invalid/production",
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
          "postgres://hosted.invalid/production",
        ...overrides,
      },
      stdio: "pipe",
    });
  } catch (error) {
    status = (error as { status: number }).status;
  }
  return { status, trace: readFileSync(trace, "utf8") };
}

describe("Nix development startup", () => {
  it("starts and migrates local Postgres before forwarding dev arguments", () => {
    const result = run({ STORMHACKS_DB_PORT: "55479" });
    expect(result.status).toBe(0);
    expect(result.trace).toContain("createdb stormhacks");
    expect(result.trace).toContain("pnpm dev --port 3010");
    expect(result.trace).toContain(
      "migration=postgres://stormhacks:stormhacks@127.0.0.1:55479/stormhacks worker=postgres://stormhacks:stormhacks@127.0.0.1:55479/stormhacks",
    );
    expect(result.trace).not.toContain("hosted.invalid");
    expect(result.trace.indexOf("pnpm db:migrate")).toBeLessThan(
      result.trace.indexOf("pnpm dev"),
    );
    expect(result.trace).not.toContain("-w stop");
  });

  it("reuses an existing database without stopping it", () => {
    const result = run({ DATABASE_RUNNING: "0", DATABASE_EXISTS: "1" });
    expect(result.status).toBe(0);
    expect(result.trace).not.toContain("createdb");
    expect(result.trace).not.toContain("-w start");
    expect(result.trace).not.toContain("-w stop");
  });

  it("does not launch the app when migration fails", () => {
    const result = run({ MIGRATION_STATUS: "42" });
    expect(result.status).toBe(42);
    expect(result.trace).not.toContain("pnpm dev");
  });

  it("preserves the app exit status and leaves Postgres running", () => {
    const result = run({ APP_STATUS: "7" });
    expect(result.status).toBe(7);
    expect(result.trace).not.toContain("-w stop");
  });
});
