import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  DocsService,
  OrganizationsService,
  ProjectsService,
} from "@stormhacks/data";
import { createAuthenticator, type AuthConfig } from "./auth";
import { createHandler } from "./handler";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "MCP over Streamable HTTP with real Postgres",
  () => {
    const databaseName = `mcp_test_${randomUUID().replaceAll("-", "")}`;
    const config: AuthConfig = {
      issuer: "https://auth.example.com",
      resource: "http://localhost:3001/mcp",
      allowedOrigins: [],
    };
    let admin: ReturnType<typeof postgres>;
    let database: ReturnType<typeof postgres>;
    let url: string;
    let keys: Awaited<ReturnType<typeof generateKeyPair>>;
    let handler: ReturnType<typeof createHandler>;
    let opened = 0;
    let disposed = 0;
    let created = false;
    let organizations: OrganizationsService;
    let projects: ProjectsService;
    let docs: DocsService;

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const connection = new URL(process.env.TEST_DATABASE_URL!);
      connection.pathname = `/${databaseName}`;
      url = connection.toString();
      database = postgres(url, { max: 5 });
      const db = drizzle(database);
      await migrate(db, { migrationsFolder: "./drizzle" });
      organizations = new OrganizationsService({ db });
      projects = new ProjectsService({ db });
      docs = new DocsService({ db });
      keys = await generateKeyPair("RS256");
      const authenticate = createAuthenticator(
        config,
        createLocalJWKSet({
          keys: [
            { ...(await exportJWK(keys.publicKey)), kid: "test", alg: "RS256" },
          ],
        }),
      );
      handler = createHandler(config, authenticate, () => {
        opened++;
        const client = postgres(url, { max: 1 });
        const requestDb = drizzle(client);
        return {
          docs: new DocsService({ db: requestDb }),
          projects: new ProjectsService({ db: requestDb }),
          organizations: new OrganizationsService({ db: requestDb }),
          dispose: async () => {
            await client.end();
            disposed++;
          },
        };
      });
    });

    afterAll(async () => {
      try {
        if (database) await database.end();
        if (created) await admin.unsafe(`DROP DATABASE ${databaseName}`);
      } finally {
        if (admin) await admin.end();
      }
    });

    async function bearer(userId: string) {
      return new SignJWT({ sid: "consent_test", client_id: "mcp_test" })
        .setSubject(userId)
        .setIssuer(config.issuer)
        .setAudience(config.resource)
        .setIssuedAt()
        .setExpirationTime("5m")
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .sign(keys.privateKey);
    }
    async function connect(userId: string) {
      const client = new Client({ name: "integration-test", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(config.resource),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${await bearer(userId)}` },
          },
          fetch: (input, init) => handler(new Request(input, init)),
        },
      );
      await client.connect(transport);
      return client;
    }
    async function fixture() {
      const userId = `user_${randomUUID()}`;
      const organization = await organizations.create(userId, "MCP org");
      const actor = { userId, organizationId: organization.id };
      const project = await projects.create(actor, { name: "MCP project" });
      const doc = await docs.create(actor, project.id, {
        title: "Original",
        content: "Original full body",
      });
      const [initial] = await docs.listChanges(actor, doc.id);
      await docs.publish(actor, doc.id, initial.id);
      return { actor, project, doc, initial };
    }
    function data(response: Awaited<ReturnType<Client["callTool"]>>) {
      expect(response.isError).not.toBe(true);
      return response.structuredContent?.data as Record<string, unknown>;
    }

    it("initializes, discovers tools, reads project/doc/history/repo/version data, proposes and deletes without publishing", async () => {
      const { actor, project, doc, initial } = await fixture();
      const repo = await projects.connectRepository(actor, {
        owner: "RockyDotSystems",
        name: "StormHacks2026",
      });
      await projects.linkRepository(actor, project.id, repo.id);
      expect(await docs.getMetadata(actor, doc.id)).toMatchObject({
        latestTitle: "Original",
      });
      const client = await connect(actor.userId);
      try {
        const tools = await client.listTools();
        expect(tools.tools).toHaveLength(11);
        expect(tools.tools.map((tool) => tool.name)).not.toContain(
          "publish_version",
        );
        for (const tool of tools.tools) {
          expect(tool.inputSchema.properties).not.toHaveProperty(
            "organizationId",
          );
          expect(tool.inputSchema.properties).not.toHaveProperty("userId");
        }
        expect(
          data(await client.callTool({ name: "get_current_organization" })),
        ).toMatchObject({
          userId: actor.userId,
          organization: { id: actor.organizationId },
        });
        expect(
          data(await client.callTool({ name: "list_projects" })),
        ).toMatchObject({ items: [{ id: project.id }], nextOffset: null });
        expect(
          data(
            await client.callTool({
              name: "list_docs",
              arguments: { projectId: project.id },
            }),
          ),
        ).toMatchObject({ items: [{ id: doc.id, projectId: project.id }] });
        expect(
          data(
            await client.callTool({
              name: "list_repositories",
              arguments: { projectId: project.id },
            }),
          ),
        ).toMatchObject({ items: [{ id: repo.id }] });
        expect(
          data(
            await client.callTool({
              name: "get_doc_metadata",
              arguments: { docId: doc.id },
            }),
          ),
        ).toMatchObject({
          latestTitle: "Original",
          latestVersion: "v1",
          changeCount: 1,
          versionCount: 1,
          hasUnpublishedChanges: false,
        });
        expect(
          data(
            await client.callTool({
              name: "get_version",
              arguments: { docId: doc.id, number: 1 },
            }),
          ),
        ).toMatchObject({
          title: "Original",
          content: "Original full body",
          label: "v1",
        });
        expect(
          data(
            await client.callTool({
              name: "list_versions",
              arguments: { docId: doc.id },
            }),
          ),
        ).toMatchObject({ items: [{ label: "v1" }] });
        const proposal = data(
          await client.callTool({
            name: "propose_change",
            arguments: {
              docId: doc.id,
              title: " Proposed ",
              content: "Entire proposed document",
            },
          }),
        );
        expect(proposal).toMatchObject({
          title: "Proposed",
          content: "Entire proposed document",
          proposed: true,
          createdBy: actor.userId,
        });
        expect(await docs.listVersions(actor, doc.id)).toHaveLength(1);
        expect(
          data(
            await client.callTool({
              name: "get_change",
              arguments: { docId: doc.id, changeId: proposal.id },
            }),
          ),
        ).toMatchObject({
          number: 2,
          immutable: false,
          proposed: true,
          content: "Entire proposed document",
        });
        const summaries = data(
          await client.callTool({
            name: "list_changes",
            arguments: { docId: doc.id, limit: 1 },
          }),
        );
        expect(summaries).toMatchObject({
          items: [{ id: initial.id, immutable: true, proposed: false }],
          nextOffset: 1,
        });
        expect(
          data(
            await client.callTool({
              name: "list_changes",
              arguments: { docId: doc.id, offset: 1, limit: 1 },
            }),
          ),
        ).toMatchObject({
          items: [{ id: proposal.id, number: 2 }],
          nextOffset: null,
        });
        expect(
          (summaries.items as Record<string, unknown>[])[0],
        ).not.toHaveProperty("content");
        expect(
          data(
            await client.callTool({
              name: "get_doc_metadata",
              arguments: { docId: doc.id },
            }),
          ),
        ).toMatchObject({
          latestTitle: "Proposed",
          latestChangeId: proposal.id,
          changeCount: 2,
          latestVersion: "v1",
          hasUnpublishedChanges: true,
        });
        expect(
          (
            await client.callTool({
              name: "delete_change",
              arguments: { docId: doc.id, changeId: initial.id },
            })
          ).isError,
        ).toBe(true);
        expect(
          data(
            await client.callTool({
              name: "delete_change",
              arguments: { docId: doc.id, changeId: proposal.id },
            }),
          ),
        ).toMatchObject({ deleted: true });
        expect(
          (
            await client.callTool({
              name: "get_change",
              arguments: { docId: doc.id, changeId: proposal.id },
            })
          ).isError,
        ).toBe(true);
        expect(
          (await docs.listChanges(actor, doc.id)).map((row) => row.id),
        ).toEqual([initial.id]);
        const frozen = await docs.proposeChange(actor, doc.id, {
          title: "Approve later",
          content: "Frozen proposal",
        });
        await docs.publish(actor, doc.id, frozen.id);
        expect(
          (
            await client.callTool({
              name: "delete_change",
              arguments: { docId: doc.id, changeId: frozen.id },
            })
          ).isError,
        ).toBe(true);
        expect(
          data(
            await client.callTool({
              name: "get_change",
              arguments: { docId: doc.id, changeId: frozen.id },
            }),
          ),
        ).toMatchObject({ proposed: true, immutable: true });
        expect(
          (
            await client.callTool({
              name: "get_change",
              arguments: { docId: doc.id, changeId: "0" },
            })
          ).isError,
        ).toBe(true);
        expect(
          (
            await client.callTool({
              name: "propose_change",
              arguments: { docId: doc.id, title: " ", content: "Body" },
            })
          ).isError,
        ).toBe(true);
      } finally {
        await client.close();
      }
      expect(disposed).toBe(opened);
    });

    it("does not disclose or mutate another organization's docs/projects even with forged identity arguments", async () => {
      const own = await fixture();
      const other = await fixture();
      const client = await connect(own.actor.userId);
      try {
        for (const name of ["list_docs", "list_repositories"]) {
          expect(
            (
              await client.callTool({
                name,
                arguments: {
                  projectId: other.project.id,
                  organizationId: other.actor.organizationId,
                },
              })
            ).isError,
          ).toBe(true);
        }
        for (const name of [
          "get_doc_metadata",
          "list_changes",
          "list_versions",
          "get_change",
          "get_version",
          "delete_change",
          "propose_change",
        ]) {
          expect(
            (
              await client.callTool({
                name,
                arguments: {
                  docId: other.doc.id,
                  changeId: other.initial.id,
                  number: 1,
                  title: "Forged",
                  content: "Forged",
                  userId: other.actor.userId,
                },
              })
            ).isError,
          ).toBe(true);
        }
        expect(await docs.listChanges(other.actor, other.doc.id)).toHaveLength(
          1,
        );
      } finally {
        await client.close();
      }
      expect(disposed).toBe(opened);
    });

    it("disposes scopes after malformed, oversized, and unsupported protocol requests", async () => {
      const { actor } = await fixture();
      const authorization = `Bearer ${await bearer(actor.userId)}`;
      const headers = {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      const malformed = await handler(
        new Request(config.resource, {
          method: "POST",
          headers,
          body: "{not-json",
        }),
      );
      expect(malformed.status).toBe(400);
      const oversized = await handler(
        new Request(config.resource, {
          method: "POST",
          headers,
          body: "x".repeat(1_100_001),
        }),
      );
      expect(oversized.status).toBe(413);
      const unsupported = await handler(
        new Request(config.resource, { method: "GET", headers }),
      );
      expect(unsupported.status).toBe(405);
      expect(disposed).toBe(opened);
    });

    it("denies zero/multiple local memberships and disposes failed request scopes", async () => {
      const userId = `user_${randomUUID()}`;
      let response = await handler(
        new Request(config.resource, {
          method: "POST",
          headers: { Authorization: `Bearer ${await bearer(userId)}` },
        }),
      );
      expect(response.status).toBe(403);
      await organizations.create(userId, "One");
      await organizations.create(userId, "Two");
      response = await handler(
        new Request(config.resource, {
          method: "POST",
          headers: { Authorization: `Bearer ${await bearer(userId)}` },
        }),
      );
      expect(response.status).toBe(403);
      expect(disposed).toBe(opened);
    });
  },
);
