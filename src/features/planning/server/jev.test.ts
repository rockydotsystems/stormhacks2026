import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_JEV_MODEL,
  DisabledJev,
  HttpJev,
  JevError,
  createJev,
} from "@/features/planning/server/jev";

const questions = {
  agreed: { instructions: "Do they agree?" },
  objects: {
    instructions: "Does anyone object?",
    criteria: { true: "Someone objects", false: "Nobody objects" },
  },
};

const ok = (answers: Record<string, unknown>) =>
  Response.json({ model: "jev-1.13.0", answers, usage: {} });

function client(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const send = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      const next = queue.shift();
      if (!next) throw new Error("no response queued");
      if (next instanceof Error) throw next;
      return next;
    },
  );
  const sleep = vi.fn(async () => {});
  const jev = new HttpJev({
    apiKey: "secret-key",
    fetch: send as unknown as typeof fetch,
    sleep,
  });
  return { jev, calls, sleep };
}

describe("HttpJev", () => {
  it("sends the state and typed questions with the key, and returns each probability", async () => {
    const { jev, calls } = client(
      ok({
        agreed: { type: "noul", noul: 0.96 },
        objects: { type: "noul", noul: 0.03 },
      }),
    );
    const state = { discussion: [{ from: "Ana S.", text: "Postgres?" }] };
    expect(await jev.askNouls(state, questions)).toEqual({
      agreed: 0.96,
      objects: 0.03,
    });
    const [{ url, init }] = calls;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: DEFAULT_JEV_MODEL,
      state,
      questions: {
        agreed: { type: "noul", instructions: "Do they agree?" },
        objects: {
          type: "noul",
          instructions: "Does anyone object?",
          criteria: { true: "Someone objects", false: "Nobody objects" },
        },
      },
    });
  });

  it("pins a model version rather than the moving alias", () => {
    expect(DEFAULT_JEV_MODEL).toMatch(/^jev-\d+\.\d+/);
    expect(DEFAULT_JEV_MODEL).not.toBe("jev-latest");
  });

  it("retries a rate limit and an overload, then succeeds", async () => {
    const { jev, calls, sleep } = client(
      new Response(null, { status: 429 }),
      new Response(null, { status: 529 }),
      ok({
        agreed: { type: "noul", noul: 1 },
        objects: { type: "noul", noul: 0 },
      }),
    );
    expect(await jev.askNouls({}, questions)).toEqual({
      agreed: 1,
      objects: 0,
    });
    expect(calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retries are spent and reports it as unavailable", async () => {
    const { jev, calls } = client(
      new Response(null, { status: 429 }),
      new Response(null, { status: 429 }),
      new Response(null, { status: 429 }),
    );
    await expect(jev.askNouls({}, questions)).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(calls).toHaveLength(3);
  });

  it("does not retry a rejected request", async () => {
    const { jev, calls } = client(new Response("bad key", { status: 401 }));
    await expect(jev.askNouls({}, questions)).rejects.toMatchObject({
      kind: "rejected",
    });
    expect(calls).toHaveLength(1);
  });

  it("keeps the response body, which can echo the chat, out of the error", async () => {
    const { jev } = client(
      new Response("echo: private chat text", { status: 422 }),
    );
    const error = await jev.askNouls({}, questions).catch((e) => e);
    expect(error).toBeInstanceOf(JevError);
    expect(error.message).not.toContain("private chat text");
    expect(error.message).not.toContain("secret-key");
  });

  it("reports a network failure as unavailable", async () => {
    const { jev } = client(new Error("socket hang up"));
    await expect(jev.askNouls({}, questions)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("rejects an answer outside 0 to 1, a wrong type, or a missing question", async () => {
    for (const answers of [
      {
        agreed: { type: "noul", noul: 1.4 },
        objects: { type: "noul", noul: 0 },
      },
      {
        agreed: { type: "choice", noul: 0.5 },
        objects: { type: "noul", noul: 0 },
      },
      { agreed: { type: "noul", noul: 0.5 } },
    ]) {
      const { jev } = client(ok(answers));
      await expect(jev.askNouls({}, questions)).rejects.toMatchObject({
        kind: "invalid-output",
      });
    }
  });
});

describe("createJev", () => {
  it("is disabled without a key, and asking fails as a config error", async () => {
    const jev = createJev({});
    expect(jev).toBeInstanceOf(DisabledJev);
    await expect(jev.askNouls({}, questions)).rejects.toMatchObject({
      kind: "config",
    });
    expect(createJev({ TYPESAFE_API_KEY: "  " })).toBeInstanceOf(DisabledJev);
  });

  it("uses the key and an optional model override", () => {
    expect(createJev({ TYPESAFE_API_KEY: "k" })).toBeInstanceOf(HttpJev);
  });
});
