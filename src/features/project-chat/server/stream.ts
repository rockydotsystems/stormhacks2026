import "server-only";
import type { ChatEvent, ChatProgress, ChatTurn } from "../contracts";
import { ApiError } from "@/server/errors";
import { HEARTBEAT_MS } from "@/features/planning/server/sse";

export function chatEventStream(options: {
  run: (
    emit: (event: ChatProgress) => void,
    signal: AbortSignal,
  ) => Promise<ChatTurn>;
  signal: AbortSignal;
  onClose: () => Promise<void>;
  heartbeatMs?: number;
}) {
  const abort = new AbortController();
  const signal = AbortSignal.any([options.signal, abort.signal]);
  const encoder = new TextEncoder();
  let gone = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        if (gone || signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          gone = true;
          abort.abort();
        }
      };
      const emit = (event: ChatEvent) =>
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const heartbeat = setInterval(
        () => send(": heartbeat\n\n"),
        options.heartbeatMs ?? HEARTBEAT_MS,
      );
      const run = async () => {
        try {
          signal.throwIfAborted();
          const turn = await options.run(emit, signal);
          emit({ type: "done", turn });
        } catch (error) {
          if (!signal.aborted) {
            const message =
              error instanceof ApiError
                ? error.message
                : "The answer could not finish. Send your question again to retry.";
            emit({ type: "error", message });
          }
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            /* Consumer already disconnected. */
          }
          await options.onClose();
        }
      };
      void run().catch(() =>
        console.error("Project chat stream cleanup failed."),
      );
    },
    cancel() {
      gone = true;
      abort.abort();
    },
  });
}
