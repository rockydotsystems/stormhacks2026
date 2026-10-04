import { createSseParser } from "@/features/planning/client/sse";
import {
  sessionEventSchema,
  type ChangeSourceDetail,
  type VersionSource,
  type ChangeSummary,
  type ConversationDetail,
  type ConversationListItem,
  type CreateConversationInput,
  type PublishInput,
  type RevertInput,
  type RevertResult,
  type SendMessageInput,
  type SendMessageResult,
  type SessionEvent,
  type VersionDetail,
  type VersionSummary,
} from "@/features/planning/session-contracts";

// One function per planning session route. Nothing here touches React.

// Why a call failed, in the terms the UI cares about.
export type ErrorKind = "auth" | "config" | "conflict" | "missing" | "other";

export class PlanningApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    // A stream error code, or "interrupted" when a stream ended without a final event.
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PlanningApiError";
  }

  get kind(): ErrorKind {
    if (this.status === 401) return "auth";
    if (this.status === 503) return "config";
    if (this.status === 409) return "conflict";
    if (this.status === 404) return "missing";
    return "other";
  }
}

const FALLBACK = "The request failed. Please try again.";
const UNREACHABLE = "Could not reach the server. Try again.";
const BASE = "/api/planning/conversations";

async function errorFrom(response: Response): Promise<PlanningApiError> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error
      : FALLBACK;
  return new PlanningApiError(response.status, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new PlanningApiError(0, UNREACHABLE);
  }
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

const at = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export function listConversations(): Promise<ConversationListItem[]> {
  return request(BASE);
}

export function createConversation(
  input: CreateConversationInput,
): Promise<ConversationDetail> {
  return request(BASE, post(input));
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return request(at(id));
}

// The non-streaming turn. The streaming path below is what the UI uses.
export function sendMessage(
  id: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  return request(`${at(id)}/messages`, post(input));
}

export function publish(
  id: string,
  input: PublishInput = {},
): Promise<VersionSummary> {
  return request(`${at(id)}/publish`, post(input));
}

export function revert(id: string, input: RevertInput): Promise<RevertResult> {
  return request(`${at(id)}/revert`, post(input));
}

// Asks the server to check who is in the chat and switch standby on or off to match. The server
// decides from the live room, so this cannot force either state.
export function syncStandby(id: string): Promise<ConversationDetail> {
  return request(`${at(id)}/standby/sync`, post({}));
}

// Ends standby by updating the document from the discussion, without waiting for the model to
// judge that everyone agreed.
export function applyStandby(id: string): Promise<ConversationDetail> {
  return request(`${at(id)}/standby/apply`, post({}));
}

export function listChanges(id: string): Promise<ChangeSummary[]> {
  return request(`${at(id)}/changes`);
}

export function getChangeSource(
  id: string,
  changeId: string,
): Promise<ChangeSourceDetail> {
  return request(`${at(id)}/changes/${encodeURIComponent(changeId)}/source`);
}

// `number` is a version number, or "draft" for the changes after the latest version.
export function getVersionSource(
  id: string,
  number: number | "draft",
): Promise<VersionSource> {
  return request(`${at(id)}/versions/${number}/source`);
}

export function listVersions(id: string): Promise<VersionSummary[]> {
  return request(`${at(id)}/versions`);
}

export function getVersion(id: string, number: number): Promise<VersionDetail> {
  return request(`${at(id)}/versions/${number}`);
}

type EventOf<T extends SessionEvent["type"]> = Extract<
  SessionEvent,
  { type: T }
>;

export type StreamHandlers = {
  onReasoning?: (text: string) => void;
  onDelta?: (text: string) => void;
  onDocumentChanged?: (event: EventOf<"document.changed">) => void;
  signal?: AbortSignal;
};

const CODE_STATUS: Record<EventOf<"error">["code"], number> = {
  conflict: 409,
  not_found: 404,
  agent_failed: 502,
  invalid_output: 502,
  internal: 500,
};

export const INTERRUPTED = "interrupted";

// Streams one turn. Resolves with the final event. Rejects with PlanningApiError when the
// request fails, the server sends an error event, or the stream ends without a final event.
// After a failure the streamed text is not trustworthy, so callers discard it and reload the
// conversation, because the user's message may already be saved.
export async function streamMessage(
  conversationId: string,
  input: SendMessageInput,
  handlers: StreamHandlers = {},
): Promise<EventOf<"message.final">> {
  let response: Response;
  try {
    response = await fetch(`${at(conversationId)}/messages/stream`, {
      ...post(input),
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      signal: handlers.signal,
    });
  } catch (caught) {
    if (handlers.signal?.aborted) throw caught;
    throw new PlanningApiError(0, UNREACHABLE);
  }
  if (!response.ok) throw await errorFrom(response);
  if (!response.body) {
    throw new PlanningApiError(
      0,
      "The reply could not be streamed. Reload the conversation.",
      INTERRUPTED,
    );
  }

  const parser = createSseParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const seen = new Set<string>();
  let final: EventOf<"message.final"> | null = null;

  const handle = (data: string) => {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = sessionEventSchema.safeParse(json);
    if (!parsed.success) return;
    const event = parsed.data;
    // Reconnects can repeat events, so a seen id is ignored.
    if (seen.has(event.id)) return;
    seen.add(event.id);
    switch (event.type) {
      case "reasoning.delta":
        handlers.onReasoning?.(event.text);
        break;
      case "message.delta":
        handlers.onDelta?.(event.text);
        break;
      case "document.changed":
        handlers.onDocumentChanged?.(event);
        break;
      case "message.final":
        final = event;
        break;
      case "error":
        throw new PlanningApiError(
          CODE_STATUS[event.code],
          event.message,
          event.code,
        );
    }
  };

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (caught) {
        if (handlers.signal?.aborted) throw caught;
        throw new PlanningApiError(
          0,
          "The connection dropped. Reload the conversation to see what was saved.",
          INTERRUPTED,
        );
      }
      if (chunk.done) break;
      for (const frame of parser.push(
        decoder.decode(chunk.value, { stream: true }),
      )) {
        handle(frame.data);
      }
    }
    for (const frame of [...parser.push(decoder.decode()), ...parser.flush()]) {
      handle(frame.data);
    }
  } finally {
    reader.releaseLock();
  }

  if (!final) {
    throw new PlanningApiError(
      0,
      "The reply was cut off. Reload the conversation to see what was saved.",
      INTERRUPTED,
    );
  }
  return final;
}
