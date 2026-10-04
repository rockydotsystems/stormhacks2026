import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "cloudflare:workers": fileURLToPath(
        new URL("./tests/cloudflare.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "apps/mcp/src/**/*.test.ts",
      "apps/realtime/src/**/*.test.ts",
      "packages/data/src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "worker/**/*.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
  },
});
