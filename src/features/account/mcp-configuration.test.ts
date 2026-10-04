import { describe, expect, it } from "vitest";
import { createMcpSetup, parseMcpEndpoint } from "./mcp-configuration";

describe("MCP client configuration", () => {
  it("generates personal setup commands for popular coding agents", () => {
    const result = createMcpSetup(" https://decisions.example/mcp ");
    expect(result.url).toBe("https://decisions.example/mcp");
    expect(result.commands).toEqual({
      claude:
        "claude mcp add --transport http --scope user whydidwechoosethis 'https://decisions.example/mcp'",
      opencode:
        "opencode mcp add whydidwechoosethis --global --url 'https://decisions.example/mcp'",
      codex:
        "codex mcp add whydidwechoosethis --url 'https://decisions.example/mcp'\ncodex mcp login whydidwechoosethis",
    });
  });

  it("provides explicit previews instead of inventing a hosted endpoint", () => {
    const result = createMcpSetup();
    expect(result.url).toBeUndefined();
    for (const command of Object.values(result.commands)) {
      expect(command).toContain("'<MCP_SERVER_URL>'");
    }
  });

  it("quotes shell metacharacters in the URL", () => {
    const result = createMcpSetup("https://decisions.example/$(whoami)'/mcp");
    expect(result.commands.opencode).toContain(
      "'https://decisions.example/$(whoami)'\"'\"'/mcp'",
    );
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "allows local development over HTTP on %s",
    (host) => {
      expect(parseMcpEndpoint(`http://${host}:3001/mcp`)).toBe(
        `http://${host}:3001/mcp`,
      );
    },
  );

  it.each([
    "",
    "not a URL",
    "http://decisions.example/mcp",
    "http://localhost.example/mcp",
    "ftp://decisions.example/mcp",
    "https://user:password@decisions.example/mcp",
    "https://decisions.example/mcp?token=secret",
    "https://decisions.example/mcp#secret",
  ])("rejects unsafe or invalid endpoints: %s", (endpoint) => {
    expect(() => parseMcpEndpoint(endpoint)).toThrow();
  });
});
