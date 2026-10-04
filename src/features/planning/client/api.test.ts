import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlanningApiError,
  getConversation,
  publish,
  streamMessage,
} from "@/features/planning/client/api";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";

function message(id: string, role: "user" | "assistant", content: string) {
  return {
    id,
    role,
    content,
    via: "text",
    questions: null,
    createdAt: "2026-10-03T12:00:00.000Z",
    producedChangeId: null,
  };
}

function frame(seq: number, body: Record<string, unknown>): string {
  const event = { id: `9:${seq}`, seq, conversationId: CONVERSATION, ...body };
  return `id: 9:${seq}\nevent: ${String(body.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

const FINAL = frame(3, {
  type: "message.final",
  userMessage: message("9", "user", "hi"),
  assistantMessage: message("10", "assistant", "Hello there"),
  phase: "grilling",
  checklist: [],
});

function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function stubFetch(response: Response | (() => Response)) {
  const fn = vi.fn(async () =>
    typeof response === "function" ? response() : response,
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamMessage", () => {
  it("delivers deltas and a document change, then resolves with the final event", async () => {
    stubFetch(
      streamOf([
        frame(1, { type: "message.delta", text: "Hel" }),
        frame(2, { type: "message.delta", text: "lo" }),
        FINAL,
      ]),
    );
    const deltas: string[] = [];
    const final = await streamMessage(
      CONVERSATION,
      { text: "hi", via: "text" },
      { onDelta: (text) => deltas.push(text) },
    );
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(final.assistantMessage.content).toBe("Hello there");
  });

  it("copes with frames split across chunks and a multi-byte character", async () => {
    const delta = frame(1, { type: "message.delta", text: "café \u{1F680}" });
    const bytes = new TextEncoder().encode(delta + FINAL);
    const cut = delta.indexOf("\u{1F680}") + 2;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, cut));
          controller.enqueue(bytes.slice(cut));
          controller.close();
        },
      }),
    );
    stubFetch(response);
    const deltas: string[] = [];
    await streamMessage(
      CONVERSATION,
      { text: "hi", via: "text" },
      { onDelta: (text) => deltas.push(text) },
    );
    expect(deltas).toEqual(["café \u{1F680}"]);
  });

  it("ignores heartbeats and repeated event ids", async () => {
    stubFetch(
      streamOf([
        ": heartbeat\n\n",
        frame(1, { type: "message.delta", text: "a" }),
        frame(1, { type: "message.delta", text: "a" }),
        FINAL,
      ]),
    );
    const deltas: string[] = [];
    await streamMessage(
      CONVERSATION,
      { text: "hi", via: "text" },
      { onDelta: (text) => deltas.push(text) },
    );
    expect(deltas).toEqual(["a"]);
  });

  it("throws the server's error event with a mapped status", async () => {
    stubFetch(
      streamOf([
        frame(1, { type: "message.delta", text: "partial" }),
        frame(2, { type: "error", code: "conflict", message: "Busy." }),
      ]),
    );
    const error = await streamMessage(CONVERSATION, {
      text: "hi",
      via: "text",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanningApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "conflict",
      kind: "conflict",
    });
  });

  it("fails when the stream ends without a final event", async () => {
    stubFetch(streamOf([frame(1, { type: "message.delta", text: "partial" })]));
    const error = await streamMessage(CONVERSATION, {
      text: "hi",
      via: "text",
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "interrupted" });
  });

  it("fails when a frame is cut mid-way", async () => {
    stubFetch(
      streamOf([frame(1, { type: "message.delta", text: "x" }), 'data: {"typ']),
    );
    await expect(
      streamMessage(CONVERSATION, { text: "hi", via: "text" }),
    ).rejects.toMatchObject({ code: "interrupted" });
  });

  it("maps an HTTP error before the stream starts", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Sign in to continue." }), {
        status: 401,
      }),
    );
    const error = await streamMessage(CONVERSATION, {
      text: "hi",
      via: "text",
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 401,
      kind: "auth",
      message: "Sign in to continue.",
    });
  });

  it("reports a network failure as unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(
      streamMessage(CONVERSATION, { text: "hi", via: "text" }),
    ).rejects.toMatchObject({ status: 0 });
  });

  it("sends an idempotency id and asks for an event stream", async () => {
    const fetchMock = stubFetch(streamOf([FINAL]));
    await streamMessage(CONVERSATION, {
      text: "hi",
      via: "voice",
      clientMessageId: "22222222-2222-4222-8222-222222222222",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `/api/planning/conversations/${CONVERSATION}/messages/stream`,
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      via: "voice",
      clientMessageId: "22222222-2222-4222-8222-222222222222",
    });
    expect((init.headers as Record<string, string>).Accept).toBe(
      "text/event-stream",
    );
  });
});

describe("JSON calls", () => {
  it("maps statuses to error kinds", async () => {
    stubFetch(() => new Response("{}", { status: 503 }));
    await expect(getConversation(CONVERSATION)).rejects.toMatchObject({
      kind: "config",
    });
    stubFetch(() => new Response("{}", { status: 404 }));
    await expect(getConversation(CONVERSATION)).rejects.toMatchObject({
      kind: "missing",
    });
  });

  it("posts publish with the chosen change id", async () => {
    const fetchMock = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            number: 1,
            label: "v1",
            changeId: "5",
            publishedBy: "u",
            publishedAt: "2026-10-03T12:00:00.000Z",
          }),
        ),
    );
    const version = await publish(CONVERSATION, { changeId: "5" });
    expect(version.label).toBe("v1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`/api/planning/conversations/${CONVERSATION}/publish`);
    expect(JSON.parse(init.body as string)).toEqual({ changeId: "5" });
  });
});
