import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RequestScope } from "./handler";
import { createHandler } from "./handler";

const organizations = [
  { id: "org_one", name: "One", createdAt: "2026-10-04T00:00:00Z" },
  { id: "org_two", name: "Two", createdAt: "2026-10-04T00:00:00Z" },
];

async function fixture(memberships = organizations) {
  const list = vi.fn().mockResolvedValue([]);
  const dispose = vi.fn();
  const resource = "https://mcp.example.com/mcp";
  const handler = createHandler(
    { issuer: "https://auth.example.com", resource, allowedOrigins: [] },
    async () => "user_test",
    () =>
      ({
        organizations: { list: async () => memberships },
        projects: { list },
        docs: {},
        dispose,
      }) as unknown as RequestScope,
  );
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      fetch: (input, init) => handler(new Request(input, init)),
    }),
  );
  return { client, list, dispose };
}

describe("MCP organization discovery", () => {
  it("connects and lists all memberships without selecting one", async () => {
    const { client } = await fixture();
    try {
      const response = await client.callTool({ name: "list_organizations" });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent?.data).toEqual({
        items: organizations,
        nextOffset: null,
      });
    } finally {
      await client.close();
    }
  });

  it("requires selection for multiple memberships and checks it before calling services", async () => {
    const { client, list } = await fixture();
    try {
      expect((await client.callTool({ name: "list_projects" })).isError).toBe(
        true,
      );
      expect(
        (
          await client.callTool({
            name: "list_projects",
            arguments: { organizationId: "org_foreign" },
          })
        ).isError,
      ).toBe(true);
      expect(list).not.toHaveBeenCalled();
      const response = await client.callTool({
        name: "list_projects",
        arguments: { organizationId: "org_two" },
      });
      expect(response.isError).not.toBe(true);
      expect(list).toHaveBeenCalledWith(
        { userId: "user_test", organizationId: "org_two" },
        { offset: 0, limit: 51 },
      );
    } finally {
      await client.close();
    }
  });

  it("allows empty discovery but denies scoped tools without membership", async () => {
    const { client, list } = await fixture([]);
    try {
      expect(
        (await client.callTool({ name: "list_organizations" }))
          .structuredContent?.data,
      ).toEqual({ items: [], nextOffset: null });
      expect((await client.callTool({ name: "list_projects" })).isError).toBe(
        true,
      );
      expect(list).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it("keeps implicit selection for a single membership", async () => {
    const { client, list } = await fixture([organizations[0]]);
    try {
      expect(
        (await client.callTool({ name: "list_projects" })).isError,
      ).not.toBe(true);
      expect(list).toHaveBeenCalledWith(
        { userId: "user_test", organizationId: "org_one" },
        { offset: 0, limit: 51 },
      );
    } finally {
      await client.close();
    }
  });

  it("rechecks memberships between calls and disposes denied requests", async () => {
    const memberships = [...organizations];
    const { client, list, dispose } = await fixture(memberships);
    try {
      await client.callTool({
        name: "list_projects",
        arguments: { organizationId: "org_two" },
      });
      list.mockClear();
      memberships.pop();
      const disposals = dispose.mock.calls.length;
      const response = await client.callTool({
        name: "list_projects",
        arguments: { organizationId: "org_two" },
      });
      expect(response.isError).toBe(true);
      expect(list).not.toHaveBeenCalled();
      expect(dispose).toHaveBeenCalledTimes(disposals + 1);
      expect(
        (await client.callTool({ name: "list_organizations" }))
          .structuredContent?.data,
      ).toEqual({ items: [organizations[0]], nextOffset: null });
    } finally {
      await client.close();
    }
  });
});
