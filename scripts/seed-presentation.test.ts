import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("refuses remote database seeding before connecting", () => {
  expect(() =>
    execFileSync(process.execPath, ["scripts/seed-presentation.mjs"], {
      env: {
        ...process.env,
        PRESENTATION_DATABASE_URL: "postgres://example.invalid/presentation",
      },
      stdio: "pipe",
    }),
  ).toThrow(/Presentation seeding requires a local database/);
});
