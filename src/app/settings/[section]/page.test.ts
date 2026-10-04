import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("@/features/dashboard/components/dashboard", () => ({
  Dashboard: () => null,
}));

afterEach(() => vi.unstubAllEnvs());

it("temporarily redirects team settings to profile", async () => {
  await expect(
    SettingsPage({
      params: Promise.resolve({ section: "team" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/settings/profile;307;",
  });
});

describe("personal MCP setup endpoint", () => {
  async function page() {
    return SettingsPage({
      params: Promise.resolve({ section: "mcp" }),
      searchParams: Promise.resolve({}),
    });
  }

  it("uses the operator-configured endpoint in client setup", async () => {
    vi.stubEnv("MCP_RESOURCE_URL", "https://decisions.example/mcp");
    expect((await page()).props.mcpEndpoint).toBe(
      "https://decisions.example/mcp",
    );
  });

  it.each([
    undefined,
    "",
    "not a URL",
    "https://user:secret@decisions.example/mcp",
  ])(
    "keeps setup unavailable for missing or invalid configuration: %s",
    async (endpoint) => {
      vi.stubEnv("MCP_RESOURCE_URL", endpoint);
      expect((await page()).props.mcpEndpoint).toBeUndefined();
    },
  );
});
