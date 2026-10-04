import { describe, expect, it } from "vitest";
import { voiceBubble } from "./voice-bubble";

describe("voice thought bubbles", () => {
  it("shows only the latest thought segment, not the earlier response", () => {
    expect(
      voiceBubble({
        thinking: true,
        reasoning: "First thought.\n\nLatest thought.",
        reply: "Earlier reply",
      }),
    ).toEqual({ kind: "thought", text: "Latest thought." });
  });

  it("replaces thinking with the final reply", () => {
    expect(
      voiceBubble({
        thinking: false,
        reasoning: "A thought",
        reply: "The final response",
      }),
    ).toEqual({ kind: "reply", text: "The final response" });
  });

  it("keeps a long reply compact without modifying the transcript", () => {
    const reply = "A detailed response about your document. ".repeat(20);
    const bubble = voiceBubble({ thinking: false, reasoning: "", reply });
    expect(bubble?.text.length).toBeLessThanOrEqual(240);
    expect(bubble?.text.endsWith("…")).toBe(true);
    expect(reply.length).toBeGreaterThan(240);
  });

  it("shows a placeholder until reasoning arrives and no empty reply bubble", () => {
    expect(
      voiceBubble({ thinking: true, reasoning: "", reply: "" })?.text,
    ).toBe("Thinking it through…");
    expect(
      voiceBubble({ thinking: false, reasoning: "Old thought", reply: "" }),
    ).toBeNull();
  });
});
