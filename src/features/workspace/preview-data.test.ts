import { describe, expect, it } from "vitest";
import { documents, initialConversations, previewReply } from "./preview-data";

describe("workspace preview", () => {
  it("opens existing documents from every seeded conversation", () => {
    const ids = documents.map((document) => document.id);
    for (const conversation of initialConversations) {
      for (const message of conversation.messages) {
        if (message.documentId) expect(ids).toContain(message.documentId);
      }
    }
  });

  it.each([
    ["Explore the design", "research"],
    ["Make a launch plan", "checklist"],
    ["Help with an idea", "brief"],
  ])("selects a sample document for %s", (prompt, documentId) => {
    const reply = previewReply(prompt);
    expect(reply.documentId).toBe(documentId);
    expect(reply.text).toMatch(/sample response|preview/i);
  });
});
