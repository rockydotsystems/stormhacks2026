import { describe, expect, it } from "vitest";
import { readChatStream } from "./stream";
import type { ChatEvent, ChatTurn } from "../contracts";

const turn: ChatTurn = {
  id: "turn",
  question: "Why?",
  answer: "A reason.",
  via: "text",
  sources: [],
  createdAt: "2026-10-04",
};
const frame = (event: ChatEvent) =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
function response(text: string) {
  const encoded = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < encoded.length; i += 3)
          controller.enqueue(encoded.slice(i, i + 3));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
describe("project chat SSE client", () => {
  it("delivers growing answer events and only completes on the stored turn", async () => {
    const events: ChatEvent[] = [];
    const result = await readChatStream(
      response(
        ": heartbeat\n\n" +
          frame({ type: "title", title: "Database choice" }) +
          frame({ type: "answer", text: "A ré" }) +
          frame({ type: "answer", text: "A reason." }) +
          frame({ type: "done", turn }),
      ),
      (event) => events.push(event),
    );
    expect(events.map((event) => event.type)).toEqual([
      "title",
      "answer",
      "answer",
      "done",
    ]);
    expect(events[1]).toEqual({ type: "answer", text: "A ré" });
    expect(result).toEqual(turn);
  });
  it("reports server errors without committing a partial reply", async () => {
    await expect(
      readChatStream(
        response(
          frame({ type: "answer", text: "Not finished" }) +
            frame({ type: "error", message: "Please retry." }),
        ),
        () => undefined,
      ),
    ).rejects.toThrow("Please retry.");
  });
  it("rejects truncated streams and missing terminal events", async () => {
    await expect(
      readChatStream(
        response(frame({ type: "answer", text: "Partial" })),
        () => undefined,
      ),
    ).rejects.toThrow("interrupted");
    await expect(
      readChatStream(
        response(frame({ type: "done", turn }).trimEnd()),
        () => undefined,
      ),
    ).rejects.toThrow("interrupted");
  });
  it("reports HTTP failures, wrong protocols, and cancelled requests", async () => {
    await expect(
      readChatStream(
        Response.json({ error: "Chat not found." }, { status: 404 }),
        () => undefined,
      ),
    ).rejects.toThrow("Chat not found");
    await expect(
      readChatStream(Response.json(turn), () => undefined),
    ).rejects.toThrow("did not return a stream");
    const abort = new AbortController();
    abort.abort();
    await expect(
      readChatStream(
        response(frame({ type: "done", turn })),
        () => undefined,
        abort.signal,
      ),
    ).rejects.toThrow();
  });
});
