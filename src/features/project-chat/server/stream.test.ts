import { describe, expect, it, vi } from "vitest";
import { chatEventStream } from "./stream";
import type { ChatTurn } from "../contracts";
import { ApiError } from "@/server/errors";

const turn: ChatTurn = {
  id: "turn",
  question: "Why?",
  answer: "A reason.",
  via: "text",
  sources: [],
  createdAt: "2026-10-04",
};
describe("private chat stream lifetime", () => {
  it("sends partial text while generation is still running, then closes the scope once", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onClose = vi.fn(async () => undefined);
    const stream = chatEventStream({
      signal: new AbortController().signal,
      onClose,
      run: async (emit) => {
        emit({ type: "answer", text: "A" });
        await waiting;
        return turn;
      },
    });
    const reader = stream.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"text":"A"');
    expect(onClose).not.toHaveBeenCalled();
    finish();
    const final = await reader.read();
    expect(new TextDecoder().decode(final.value)).toContain('"type":"done"');
    await reader.read();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
  it("aborts generation and releases the request scope on disconnect", async () => {
    let aborted = false;
    const onClose = vi.fn(async () => undefined);
    const stream = chatEventStream({
      signal: new AbortController().signal,
      onClose,
      run: async (_emit, signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve();
            },
            { once: true },
          ),
        );
        signal.throwIfAborted();
        return turn;
      },
    });
    await stream.cancel();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(aborted).toBe(true);
  });
  it("sends safe errors and releases the scope on failure", async () => {
    const onClose = vi.fn(async () => undefined);
    const stream = chatEventStream({
      signal: new AbortController().signal,
      onClose,
      run: async () => {
        throw new ApiError(409, "Another question is running.");
      },
    });
    expect(await new Response(stream).text()).toContain(
      "Another question is running.",
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
