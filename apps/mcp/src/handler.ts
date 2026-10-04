import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ApiError, type OrganizationsService } from "@stormhacks/data";
import {
  protectedResourceMetadata,
  unauthorized,
  type AuthConfig,
} from "./auth";
import { createMcpServer, type ToolContext } from "./tools";

export type RequestScope = Pick<ToolContext, "docs" | "projects"> & {
  organizations: OrganizationsService;
  dispose(): Promise<void>;
};

export function createHandler(
  config: AuthConfig,
  authenticate: (request: Request) => Promise<string>,
  createScope: () => RequestScope,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    if (
      url.origin !== new URL(config.resource).origin ||
      (origin !== null && !config.allowedOrigins.includes(origin))
    ) {
      return Response.json({ error: "Origin not allowed." }, { status: 403 });
    }
    const respond = (response: Response) => {
      response.headers.set("Cache-Control", "no-store");
      if (origin) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Vary", "Origin");
        response.headers.set(
          "Access-Control-Expose-Headers",
          "WWW-Authenticate, MCP-Protocol-Version",
        );
      }
      return response;
    };
    if (
      [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ].includes(url.pathname)
    ) {
      return respond(Response.json(protectedResourceMetadata(config)));
    }
    if (url.pathname !== "/mcp")
      return respond(new Response("Not found", { status: 404 }));
    if (request.method === "OPTIONS") {
      return respond(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
          },
        }),
      );
    }
    let userId: string;
    try {
      userId = await authenticate(request);
    } catch {
      return respond(unauthorized(config));
    }

    // No server-initiated streams or sessions in this stateless app.
    if (request.method !== "POST") {
      return respond(
        new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "POST, OPTIONS" },
        }),
      );
    }

    const scope = createScope();
    try {
      const memberships = await scope.organizations.list(userId);
      if (memberships.length !== 1)
        throw new ApiError(
          403,
          "Exactly one organization membership is required. Contact an administrator.",
        );
      const organization = memberships[0];
      const server = createMcpServer({
        ...scope,
        organization,
        actor: { userId, organizationId: organization.id },
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: 1_100_000,
      });
      try {
        await server.connect(transport);
        return respond(await transport.handleRequest(request));
      } finally {
        await server.close();
      }
    } catch (error) {
      if (error instanceof ApiError)
        return respond(
          Response.json({ error: error.message }, { status: error.status }),
        );
      return respond(
        Response.json(
          { error: "Unable to handle this request." },
          { status: 500 },
        ),
      );
    } finally {
      await scope.dispose();
    }
  };
}
