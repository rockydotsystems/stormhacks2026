// The pure parts of the live connection to a conversation's chat room. The hook that owns the
// WebSocket is in use-live-conversation.ts. Everything here can be tested without a browser.

export type LiveUser = { userId: string; displayName: string };

export type LiveMessage =
  | { type: "presence"; users: LiveUser[] }
  | {
      type: "changed";
      reason: "message" | "document" | "standby" | "participants";
    };

const REASONS = new Set(["message", "document", "standby", "participants"]);

// The room only sends these two shapes. Anything else is ignored rather than trusted.
export function parseLiveMessage(data: unknown): LiveMessage | null {
  if (typeof data !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type === "changed") {
    return typeof message.reason === "string" && REASONS.has(message.reason)
      ? { type: "changed", reason: message.reason as never }
      : null;
  }
  if (message.type === "presence" && Array.isArray(message.users)) {
    const users = message.users.filter(
      (user): user is LiveUser =>
        Boolean(user) &&
        typeof user === "object" &&
        typeof (user as LiveUser).userId === "string" &&
        typeof (user as LiveUser).displayName === "string",
    );
    return { type: "presence", users };
  }
  return null;
}

export function liveUrl(
  location: { protocol: string; host: string },
  conversationId: string,
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/api/planning/conversations/${encodeURIComponent(conversationId)}/live`;
}

// 1s, 2s, 4s, 8s, then 15s. A little jitter keeps a room full of tabs from reconnecting together.
export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(1000 * 2 ** attempt, 15_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

// The server decides the mode. The client only says when it is worth asking: two or more people
// here while the chat is still active, or one or none while it is still in standby.
export function needsStandbySync(
  mode: "active" | "standby",
  present: number,
): boolean {
  return (
    (mode === "active" && present >= 2) || (mode === "standby" && present <= 1)
  );
}

// A stable color for a person, so their messages are easy to tell apart. Only the hue is
// chosen here. The stylesheet picks lightness and chroma for the current theme.
export function authorHue(userId: string): number {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function initials(name: string): string {
  const parts = name.replace(/[.]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters =
    parts.length === 1 ? parts[0].slice(0, 1) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

// "Ana S.", "Ana S. and Ben K.", "Ana S., Ben K. and Cy L."
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
