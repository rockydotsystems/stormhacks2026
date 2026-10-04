import { createSseParser } from "@/features/planning/client/sse";
import { chatEventSchema, type ChatEvent, type ChatTurn } from "../contracts";

export async function readChatStream(
  response: Response,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<ChatTurn> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || "Could not send your question. Please try again.",
    );
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.startsWith("text/event-stream")
  )
    throw new Error("The chat did not return a stream. Please try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let completed: ChatTurn | null = null;
  const consume = (text: string) => {
    for (const frame of parser.push(text)) {
      const event = chatEventSchema.parse(JSON.parse(frame.data));
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") completed = event.turn;
      onEvent(event);
    }
  };
  try {
    while (!completed) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) {
        consume(decoder.decode());
        break;
      }
      consume(decoder.decode(chunk.value, { stream: true }));
    }
    if (!completed)
      throw new Error(
        "The answer was interrupted. Send your question again to retry.",
      );
    return completed;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
