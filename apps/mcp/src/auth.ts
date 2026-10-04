import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export type AuthConfig = {
  issuer: string;
  resource: string;
  allowedOrigins: string[];
};

export function authConfig(env: {
  AUTHKIT_ISSUER: string;
  MCP_RESOURCE_URL: string;
  MCP_ALLOWED_ORIGINS?: string;
}): AuthConfig {
  const issuer = new URL(env.AUTHKIT_ISSUER);
  const resource = new URL(env.MCP_RESOURCE_URL);
  if (
    issuer.protocol !== "https:" ||
    issuer.pathname !== "/" ||
    issuer.search ||
    issuer.hash ||
    issuer.username ||
    issuer.password
  ) {
    throw new Error("AUTHKIT_ISSUER must be an HTTPS AuthKit origin.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(resource.hostname);
  if (
    (resource.protocol !== "https:" &&
      !(local && resource.protocol === "http:")) ||
    resource.pathname !== "/mcp" ||
    resource.search ||
    resource.hash ||
    resource.username ||
    resource.password
  ) {
    throw new Error(
      "MCP_RESOURCE_URL must be the HTTPS /mcp endpoint (HTTP is local-only).",
    );
  }
  const allowedOrigins = (env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    if (new URL(origin).origin !== origin)
      throw new Error("MCP_ALLOWED_ORIGINS must contain exact origins.");
  }
  return { issuer: issuer.origin, resource: resource.href, allowedOrigins };
}

const personClaims = z.object({
  sub: z.string().startsWith("user_"),
  sid: z.string().min(1),
  client_id: z.string().min(1),
});

export function createAuthenticator(
  config: AuthConfig,
  key: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(`${config.issuer}/oauth2/jwks`),
  ),
) {
  return async (request: Request): Promise<string> => {
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) throw new Error("Bearer token required.");
    const { payload } = await jwtVerify(token, key, {
      issuer: config.issuer,
      audience: config.resource,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat", "sid", "client_id"],
    });
    // Connect user tokens have a consent ID; machine-to-machine tokens do not.
    return personClaims.parse(payload).sub;
  };
}

export function protectedResourceMetadata(config: AuthConfig) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
  };
}

export function unauthorized(config: AuthConfig) {
  const metadataUrl = `${new URL(config.resource).origin}/.well-known/oauth-protected-resource/mcp`;
  return Response.json(
    { error: "Sign in through your MCP client's OAuth flow." },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${metadataUrl}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
