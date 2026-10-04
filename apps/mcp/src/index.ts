import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  DocsService,
  OrganizationsService,
  ProjectsService,
} from "@stormhacks/data";
import { authConfig, createAuthenticator } from "./auth";
import { createHandler } from "./handler";

export type Env = Cloudflare.Env & {
  AUTHKIT_ISSUER: string;
  MCP_RESOURCE_URL: string;
  MCP_ALLOWED_ORIGINS?: string;
};

// Cache only public configuration/JWKS, never identity, services, or DB clients.
let cached:
  | { key: string; authenticate: ReturnType<typeof createAuthenticator> }
  | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let config;
    try {
      config = authConfig(env);
    } catch {
      return Response.json(
        { error: "MCP authentication is not configured." },
        { status: 503 },
      );
    }
    const key = `${config.issuer}|${config.resource}`;
    if (cached?.key !== key)
      cached = { key, authenticate: createAuthenticator(config) };
    const handler = createHandler(config, cached.authenticate, () => {
      const client = postgres(env.HYPERDRIVE.connectionString, {
        max: 5,
        fetch_types: false,
        prepare: true,
        connect_timeout: 5,
      });
      const db = drizzle(client);
      return {
        docs: new DocsService({ db }),
        projects: new ProjectsService({ db }),
        organizations: new OrganizationsService({ db }),
        dispose: () => client.end({ timeout: 5 }),
      };
    });
    return handler(request);
  },
};
