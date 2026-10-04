export const mcpAgents = [
  {
    id: "claude",
    name: "Claude Code",
    signIn:
      "Open Claude Code, run /mcp, select whydidwechoosethis, and complete the browser sign-in.",
    docs: "https://code.claude.com/docs/en/mcp",
  },
  {
    id: "opencode",
    name: "OpenCode",
    signIn:
      "Open OpenCode, run /mcps, select whydidwechoosethis, and sign in. Run opencode mcp list to check the connection.",
    docs: "https://opencode.ai/v2/docs/mcp-servers",
  },
  {
    id: "codex",
    name: "Codex",
    signIn:
      "The login command opens your browser. Complete sign-in, then open Codex and run /mcp to check the connection.",
    docs: "https://developers.openai.com/codex/mcp",
  },
] as const;

export function parseMcpEndpoint(value: string) {
  const endpoint = new URL(value.trim());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (
    (endpoint.protocol !== "https:" &&
      !(endpoint.protocol === "http:" && local)) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      "Use an HTTPS URL without credentials, query parameters, or a fragment. HTTP is only allowed for localhost.",
    );
  }
  return endpoint.href;
}

export function createMcpSetup(endpoint?: string) {
  const url = endpoint ? parseMcpEndpoint(endpoint) : undefined;
  const argument = `'${(url ?? "<MCP_SERVER_URL>").replaceAll("'", "'\"'\"'")}'`;
  return {
    url,
    commands: {
      claude: `claude mcp add --transport http --scope user whydidwechoosethis ${argument}`,
      opencode: `opencode mcp add whydidwechoosethis --global --url ${argument}`,
      codex: `codex mcp add whydidwechoosethis --url ${argument}\ncodex mcp login whydidwechoosethis`,
    },
  };
}
