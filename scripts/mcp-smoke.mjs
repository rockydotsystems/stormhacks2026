import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";

// Uses the real local Worker runtime; no remote auth or database is accessed.
const worker = await unstable_dev("apps/mcp/src/index.ts", {
  config: "apps/mcp/wrangler.jsonc",
  routes: [],
  vars: {
    AUTHKIT_ISSUER: "https://auth.example.com",
    MCP_RESOURCE_URL: "http://localhost:3001/mcp",
  },
  experimental: { disableExperimentalWarning: true },
});
try {
  const metadata = await worker.fetch(
    "http://localhost:3001/.well-known/oauth-protected-resource/mcp",
  );
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).resource, "http://localhost:3001/mcp");
  const unauthenticated = await worker.fetch("http://localhost:3001/mcp", {
    method: "POST",
  });
  assert.equal(unauthenticated.status, 401);
  assert.match(
    unauthenticated.headers.get("WWW-Authenticate"),
    /resource_metadata=/,
  );
  const invalidToken = await worker.fetch("http://localhost:3001/mcp", {
    method: "POST",
    headers: { Authorization: "Bearer invalid-token" },
  });
  assert.equal(invalidToken.status, 401);
  const wrongOrigin = await worker.fetch("http://localhost:3001/mcp", {
    headers: { Origin: "https://evil.example.com" },
  });
  assert.equal(wrongOrigin.status, 403);
  console.log(
    "MCP Worker smoke passed: discovery, OAuth challenge, invalid-token rejection, origin rejection.",
  );
} finally {
  await worker.stop();
}
