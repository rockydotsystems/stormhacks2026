import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { authConfig, createAuthenticator, type AuthConfig } from "./auth";
import { createHandler } from "./handler";

const config: AuthConfig = {
  issuer: "https://auth.example.com",
  resource: "http://localhost:3001/mcp",
  allowedOrigins: ["http://localhost:3000"],
};
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let authenticate: ReturnType<typeof createAuthenticator>;
const claims = {
  sub: "user_person",
  sid: "consent_1",
  client_id: "mcp_client",
};

async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    ...claims,
    iss: config.issuer,
    aud: config.resource,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(keys.privateKey);
}
function request(bearer?: string) {
  return new Request(config.resource, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
}

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  authenticate = createAuthenticator(
    config,
    createLocalJWKSet({
      keys: [
        { ...(await exportJWK(keys.publicKey)), kid: "test", alg: "RS256" },
      ],
    }),
  );
});

describe("human OAuth access tokens", () => {
  it("verifies signature, issuer, exact resource audience and a person consent", async () => {
    expect(await authenticate(request(await token()))).toBe("user_person");
  });
  it.each([
    { iss: "https://other.example.com" },
    { aud: "http://localhost:3001" },
    { aud: "web-app-client-id" },
    { exp: 1 },
    { nbf: Math.floor(Date.now() / 1000) + 300 },
    { exp: undefined },
    { sid: undefined },
    { sub: "client_machine" },
    { client_id: undefined },
  ])("rejects invalid or non-person claims %j", async (overrides) => {
    await expect(
      authenticate(request(await token(overrides))),
    ).rejects.toThrow();
  });
  it("rejects missing, malformed and forged tokens", async () => {
    await expect(authenticate(request())).rejects.toThrow();
    await expect(authenticate(request("not-a-jwt"))).rejects.toThrow();
    const foreign = await generateKeyPair("RS256");
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(config.issuer)
      .setAudience(config.resource)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(foreign.privateKey);
    await expect(authenticate(request(forged))).rejects.toThrow();
  });
});

describe("OAuth discovery and request boundaries", () => {
  const scope = vi.fn(() => {
    throw new Error("Database must not be opened.");
  });
  it("advertises AuthKit without requiring sign-in or opening a database", async () => {
    const handler = createHandler(
      config,
      async () => {
        throw new Error("No token");
      },
      scope,
    );
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const response = await handler(
        new Request(`http://localhost:3001${path}`),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        resource: config.resource,
        authorization_servers: [config.issuer],
        bearer_methods_supported: ["header"],
      });
    }
    expect(scope).not.toHaveBeenCalled();
  });
  it("returns an OAuth challenge instead of a sign-in tool or accepting identity arguments", async () => {
    const handler = createHandler(
      config,
      async () => {
        throw new Error("No token");
      },
      scope,
    );
    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/mcp"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(scope).not.toHaveBeenCalled();
  });
  it("rejects unapproved browser origins, null origins, and rebinding hosts before auth", async () => {
    const handler = createHandler(config, async () => "user_person", scope);
    for (const origin of ["https://evil.example.com", "null"]) {
      expect(
        (
          await handler(
            new Request(config.resource, { headers: { Origin: origin } }),
          )
        ).status,
      ).toBe(403);
    }
    expect(
      (await handler(new Request("http://evil.example.com/mcp"))).status,
    ).toBe(403);
    expect(scope).not.toHaveBeenCalled();
  });
  it("allows preflight only for configured origins", async () => {
    const handler = createHandler(config, async () => "user_person", scope);
    const response = await handler(
      new Request(config.resource, {
        method: "OPTIONS",
        headers: { Origin: config.allowedOrigins[0] },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      config.allowedOrigins[0],
    );
    expect(scope).not.toHaveBeenCalled();
  });
  it("fails closed on unsafe or missing environment configuration", () => {
    expect(
      authConfig({
        AUTHKIT_ISSUER: config.issuer,
        MCP_RESOURCE_URL: config.resource,
      }),
    ).toEqual({ ...config, allowedOrigins: [] });
    for (const issuer of [
      "http://auth.example.com",
      "https://auth.example.com/path",
      "https://u:p@auth.example.com",
    ]) {
      expect(() =>
        authConfig({
          AUTHKIT_ISSUER: issuer,
          MCP_RESOURCE_URL: config.resource,
        }),
      ).toThrow();
    }
    for (const resource of [
      "http://public.example.com/mcp",
      "https://mcp.example.com/mcp?x=1",
      "https://mcp.example.com/",
      "",
    ]) {
      expect(() =>
        authConfig({
          AUTHKIT_ISSUER: config.issuer,
          MCP_RESOURCE_URL: resource,
        }),
      ).toThrow();
    }
  });
});
