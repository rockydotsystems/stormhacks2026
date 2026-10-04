export function createMcpConfiguration(value: string) {
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
  return {
    url: endpoint.href,
    json: JSON.stringify(
      {
        servers: {
          whydidwechoosethis: { type: "http", url: endpoint.href },
        },
      },
      null,
      2,
    ),
  };
}
