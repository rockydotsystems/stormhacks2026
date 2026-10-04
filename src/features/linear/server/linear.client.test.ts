import { describe, expect, it, vi } from "vitest";
import {
  deterministicId,
  isLockedIssue,
  LinearClient,
  LinearRetryableError,
} from "./linear.client";

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("deterministicId", () => {
  it("is a stable UUID per seed", () => {
    expect(deterministicId("a:b")).toBe(deterministicId("a:b"));
    expect(deterministicId("a:b")).not.toBe(deterministicId("a:c"));
    expect(deterministicId("a:b")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("isLockedIssue", () => {
  it.each([
    ["Done", "completed", true],
    ["Canceled", "canceled", true],
    ["In Review", "started", true],
    ["Code review", "started", true],
    ["In Progress", "started", false],
    ["Todo", "unstarted", false],
    ["Backlog", "backlog", false],
  ])("%s (%s) locked=%s", (name, type, locked) => {
    expect(isLockedIssue({ state: { name, type } })).toBe(locked);
  });
});

describe("LinearClient", () => {
  it("maps rate limits to a retryable error", async () => {
    const client = new LinearClient(() =>
      reply(
        {
          errors: [
            { message: "slow down", extensions: { code: "RATELIMITED" } },
          ],
        },
        400,
      ),
    );
    await expect(client.teams("t")).rejects.toBeInstanceOf(
      LinearRetryableError,
    );
  });

  it("maps network failure and 5xx to retryable errors", async () => {
    await expect(
      new LinearClient(() => Promise.reject(new Error("down"))).teams("t"),
    ).rejects.toBeInstanceOf(LinearRetryableError);
    await expect(
      new LinearClient(() => reply({}, 503)).teams("t"),
    ).rejects.toBeInstanceOf(LinearRetryableError);
  });

  it("treats an authentication error body like a 401", async () => {
    const error = await new LinearClient(() =>
      reply(
        {
          errors: [
            { message: "bad", extensions: { code: "AUTHENTICATION_ERROR" } },
          ],
        },
        400,
      ),
    )
      .teams("t")
      .catch((caught) => caught);
    expect(error.status).toBe(409);
  });

  it("treats 401 as a reconnect problem, not a retry", async () => {
    const error = await new LinearClient(() => reply({}, 401))
      .teams("t")
      .catch((caught) => caught);
    expect(error).not.toBeInstanceOf(LinearRetryableError);
    expect(error.status).toBe(409);
  });

  it("parses teams and sends the bearer token", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      reply({
        data: { teams: { nodes: [{ id: "1", name: "Core", key: "COR" }] } },
      }),
    );
    expect(await new LinearClient(fetcher).teams("tok")).toEqual([
      { id: "1", name: "Core", key: "COR" },
    ]);
    expect(
      (fetcher.mock.calls[0][1]?.headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer tok");
  });
});
