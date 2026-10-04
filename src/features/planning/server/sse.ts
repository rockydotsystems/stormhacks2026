import "server-only";
import type { SessionEvent } from "@/features/planning/session-contracts";
import { ApiError } from "@/server/errors";
import { ModelError } from "@/features/planning/server/model";

// Server-Sent Events for one streamed planning turn.
// Frames: `id: <userMessageId>:<seq>`, `event: <type>`, `data: <the event as JSON>`, blank line.
// A comment frame (`: heartbeat`) keeps proxies from closing an idle connection.

export const HEARTBEAT_MS = 15_000;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform stops intermediaries from buffering or recompressing the stream.
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
} as const;

export function formatEvent(event: SessionEvent): string {
  // JSON.stringify never emits a raw newline, so one data line is always enough.
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

type ErrorEvent = Extract<SessionEvent, { type: "error" }>;

// Generic text only. Provider detail stays in the server log.
export function toErrorEvent(
  error: unknown,
  conversationId: string,
  seq: number,
): ErrorEvent {
  const base = {
    type: "error" as const,
    id: `${conversationId}:error:${seq}`,
    seq,
    conversationId,
  };
  if (error instanceof ApiError && error.status === 404) {
    return { ...base, code: "not_found", message: "Conversation not found." };
  }
  if (error instanceof ApiError && error.status === 409) {
    return {
      ...base,
      code: "conflict",
      message: "A message is still being processed.",
    };
  }
  console.error("Planning stream failed", error);
  if (error instanceof ModelError && error.kind === "invalid-output") {
    return {
      ...base,
      code: "invalid_output",
      message: "The planning agent returned an invalid response.",
    };
  }
  if (error instanceof ModelError || error instanceof ApiError) {
    return {
      ...base,
      code: "agent_failed",
      message: "The planning agent is unavailable.",
    };
  }
  return { ...base, code: "internal", message: "Something went wrong." };
}

/**
 * Turns the session service's event generator into an SSE byte stream.
 *
 * `first` is the generator's first `next()` call, already started by the controller. It may
 * still be pending, and it may reject (a 404 or 409 that arrived after the pre-flight window).
 * That rejection becomes an `error` event.
 *
 * The generator is always given back through `return()`, which runs the service's cleanup and
 * releases the conversation's turn lease. A client disconnect stops the loop at the next event.
 * It cannot interrupt a model call that is still running, because the service takes no abort
 * signal. The turn then finishes or fails on its own, and only a validated final result commits.
 *
 * `onClose` runs once, last. The route uses it to dispose the request scope.
 */
export function sessionEventStream(options: {
  generator: AsyncGenerator<SessionEvent>;
  first: Promise<IteratorResult<SessionEvent>>;
  conversationId: string;
  signal?: AbortSignal;
  heartbeatMs?: number;
  onClose?: () => Promise<void> | void;
}): ReadableStream<Uint8Array> {
  const { generator, first, conversationId, signal, onClose } = options;
  const encoder = new TextEncoder();
  let gone = false;
  let lastSeq = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const onAbort = () => {
    gone = true;
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The consumer is gone. The loop sees `gone` and stops.
          gone = true;
        }
      };

      const run = async () => {
        if (signal?.aborted) gone = true;
        signal?.addEventListener("abort", onAbort, { once: true });
        heartbeat = setInterval(
          () => send(": heartbeat\n\n"),
          options.heartbeatMs ?? HEARTBEAT_MS,
        );
        try {
          let result = await first;
          while (!result.done && !gone) {
            lastSeq = result.value.seq;
            send(formatEvent(result.value));
            if (gone) break;
            result = await generator.next();
          }
        } catch (error) {
          if (!gone) {
            send(formatEvent(toErrorEvent(error, conversationId, lastSeq + 1)));
          }
        } finally {
          clearInterval(heartbeat);
          signal?.removeEventListener("abort", onAbort);
          await generator.return(undefined).catch(() => undefined);
          try {
            controller.close();
          } catch {
            // Already closed by the consumer.
          }
          await onClose?.();
        }
      };
      void run();
    },
    cancel() {
      gone = true;
    },
  });
}
