import { describe, expect, it } from "vitest";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { AiSdkModel } from "@/features/planning/server/ai-sdk.model";
import { FakeModel } from "@/features/planning/server/fake.model";
import { createModel } from "@/features/planning/server/model.factory";
import { ModelError } from "@/features/planning/server/model";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

async function collect(stream: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe("FakeModel", () => {
  it("streams the scripted text in order and records requests", async () => {
    const model = new FakeModel({ text: "hello world", chunkSize: 5 });
    const chunks = await collect(
      model.streamText({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(chunks).toEqual(["hello", " worl", "d"]);
    expect(model.requests).toHaveLength(1);
  });

  it("validates structured output against the schema", async () => {
    const schema = z.object({ ready: z.boolean() });
    await expect(
      new FakeModel({ object: { ready: true } }).generateObject({
        messages: [],
        schema,
      }),
    ).resolves.toEqual({ ready: true });
    await expect(
      new FakeModel({ object: { ready: "yes" } }).generateObject({
        messages: [],
        schema,
      }),
    ).rejects.toMatchObject({ kind: "invalid-output" });
  });

  it("stops streaming when the request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const chunks = await collect(
      new FakeModel({ text: "abcdefgh" }).streamText({
        messages: [],
        signal: controller.signal,
      }),
    );
    expect(chunks).toEqual([]);
  });
});

describe("AiSdkModel", () => {
  it("returns generated text and forwards the system prompt", async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: "pong" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      },
    });
    const text = await new AiSdkModel(mock).generateText({
      system: "be brief",
      messages: [{ role: "user", content: "ping" }],
    });
    expect(text).toBe("pong");
    expect(JSON.stringify(mock.doGenerateCalls[0].prompt)).toContain(
      "be brief",
    );
  });

  it("parses structured output with Zod", async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: '{"ready":true}' }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      },
    });
    const result = await new AiSdkModel(mock).generateObject({
      messages: [{ role: "user", content: "go" }],
      schema: z.object({ ready: z.boolean() }),
    });
    expect(result).toEqual({ ready: true });
  });

  it("maps provider failures to ModelError", async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("boom");
      },
    });
    await expect(
      new AiSdkModel(mock).generateText({ messages: [] }),
    ).rejects.toBeInstanceOf(ModelError);
  });
});

describe("createModel", () => {
  it("fails with a config error when the key or model is missing", () => {
    expect(() => createModel({ OPENROUTER_MODEL: "m" })).toThrow(ModelError);
    expect(() => createModel({ OPENROUTER_API_KEY: "k" })).toThrow(ModelError);
  });

  it("rejects an unknown provider", () => {
    expect(() => createModel({ AI_PROVIDER: "nope" })).toThrow(/Unknown/);
  });

  it("builds the OpenRouter adapter by default", () => {
    const model = createModel({
      OPENROUTER_API_KEY: "k",
      OPENROUTER_MODEL: "google/gemini-3.8-flash",
    });
    expect(typeof model.streamText).toBe("function");
  });
});

describe("streamObject", () => {
  const schema = z.object({ reply: z.string(), ok: z.boolean() });

  it("FakeModel emits growing partials, then validates the result", async () => {
    const model = new FakeModel({
      object: { reply: "hello world", ok: true },
      chunkSize: 5,
    });
    const stream = model.streamObject({ messages: [], schema });
    const replies: string[] = [];
    for await (const event of stream.events) {
      if (event.type !== "partial") continue;
      const reply = (event.value as { reply?: string }).reply;
      if (reply !== undefined && reply !== replies.at(-1)) replies.push(reply);
    }
    expect(replies).toEqual(["hello", "hello worl", "hello world"]);
    await expect(stream.result).resolves.toEqual({
      reply: "hello world",
      ok: true,
    });
  });

  it("FakeModel rejects the result with invalid-output when the object is invalid", async () => {
    const model = new FakeModel({ object: { reply: 1 } });
    const stream = model.streamObject({ messages: [], schema });
    for await (const event of stream.events) void event;
    await expect(stream.result).rejects.toMatchObject({
      kind: "invalid-output",
    });
  });

  it("AiSdkModel streams partial objects and resolves the validated object", async () => {
    const json = '{"reply":"streamed text","ok":true}';
    const mock = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t" },
          ...json.match(/.{1,6}/g)!.map((delta) => ({
            type: "text-delta" as const,
            id: "t",
            delta,
          })),
          { type: "text-end" as const, id: "t" },
          {
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: "stop" },
            usage,
          },
        ]),
      }),
    });
    const stream = new AiSdkModel(mock).streamObject({
      messages: [{ role: "user", content: "go" }],
      schema,
    });
    const replies: string[] = [];
    for await (const event of stream.events) {
      if (event.type !== "partial") continue;
      const reply = (event.value as { reply?: string }).reply;
      if (reply !== undefined) replies.push(reply);
    }
    expect(replies.length).toBeGreaterThan(1);
    expect(replies.at(-1)).toBe("streamed text");
    await expect(stream.result).resolves.toEqual({
      reply: "streamed text",
      ok: true,
    });
  });
});
