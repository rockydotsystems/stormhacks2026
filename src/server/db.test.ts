import { beforeEach, describe, expect, it, vi } from "vitest";
import { container } from "@/server/container";
import { handleApi } from "@/server/http";
import { ApiError } from "@/server/errors";

const { postgres, clients } = vi.hoisted(() => {
  const clients: { end: ReturnType<typeof vi.fn> }[] = [];
  return {
    clients,
    postgres: vi.fn(() => {
      const client = { end: vi.fn().mockResolvedValue(undefined) };
      clients.push(client);
      return client;
    }),
  };
});

vi.mock("cloudflare:workers", () => ({
  env: { HYPERDRIVE: { connectionString: "postgres://local/test" } },
}));
vi.mock("postgres", () => ({ default: postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: (client: unknown) => ({ $client: client }),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

beforeEach(() => {
  clients.length = 0;
  postgres.mockClear();
});

describe("Workers database lifecycle", () => {
  it("opens lazily, reuses within a request, and closes on scope disposal", async () => {
    const first = container.createScope();
    const second = container.createScope();
    expect(postgres).not.toHaveBeenCalled();
    expect(first.cradle.db).toBe(first.cradle.db);
    expect(first.cradle.db).not.toBe(second.cradle.db);
    expect(postgres).toHaveBeenCalledWith("postgres://local/test", {
      max: 5,
      fetch_types: false,
      prepare: true,
      connect_timeout: 5,
    });
    await Promise.all([first.dispose(), second.dispose()]);
    expect(clients).toHaveLength(2);
    for (const client of clients) {
      expect(client.end).toHaveBeenCalledExactlyOnceWith({ timeout: 1 });
    }
  });

  it("closes a resolved client even when an API handler fails", async () => {
    const response = await handleApi(async ({ db }) => {
      expect(db).toBeDefined();
      throw new ApiError(400, "Invalid request.");
    });
    expect(response.status).toBe(400);
    expect(clients[0].end).toHaveBeenCalledExactlyOnceWith({ timeout: 1 });
  });
});
