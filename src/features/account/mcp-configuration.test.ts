import { describe, expect, it } from "vitest";
import { createMcpConfiguration } from "./mcp-configuration";

describe("MCP client configuration", () => {
  it("generates a remote HTTP server without credentials", () => {
    const result = createMcpConfiguration(" https://decisions.example/mcp ");
    expect(result.url).toBe("https://decisions.example/mcp");
    expect(JSON.parse(result.json)).toEqual({
      servers: {
        whydidwechoosethis: {
          type: "http",
          url: "https://decisions.example/mcp",
        },
      },
    });
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "allows local development over HTTP on %s",
    (host) => {
      expect(createMcpConfiguration(`http://${host}:3001/mcp`).url).toBe(
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
    expect(() => createMcpConfiguration(endpoint)).toThrow();
  });
});
