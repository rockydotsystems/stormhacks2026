function compact(text: string, latest = false): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= 240) return clean;
  if (latest) return `…${clean.slice(-236).replace(/^\S*\s/, "")}`;
  return `${clean.slice(0, 239).replace(/\s+\S*$/, "")}…`;
}

export function voiceBubble({
  thinking,
  reasoning,
  reply,
}: {
  thinking: boolean;
  reasoning: string;
  reply: string;
}): { kind: "thought" | "reply"; text: string } | null {
  if (thinking) {
    const segment =
      reasoning
        .trim()
        .split(/\n\s*\n/)
        .at(-1) ?? "";
    return {
      kind: "thought",
      text: compact(segment, true) || "Thinking it through…",
    };
  }
  return reply.trim() ? { kind: "reply", text: compact(reply) } : null;
}
