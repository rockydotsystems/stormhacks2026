import { describe, expect, it } from "vitest";
import { documentBlocks } from "./document-blocks";

describe("document snapshot blocks", () => {
  it("preserves prose, headings, list types, and literal code", () => {
    expect(
      documentBlocks(
        "## Scope\r\nTwo lines\r\nof intent.\r\n\r\n- Requirement\r\n1. First step\r\n```ts\r\n# not a heading\r\n<script>alert(1)</script>\r\n```",
      ),
    ).toEqual([
      { type: "heading", text: "Scope", level: 2 },
      { type: "paragraph", text: "Two lines\nof intent." },
      { type: "list", text: "Requirement", ordered: false },
      { type: "list", text: "First step", ordered: true },
      { type: "code", text: "# not a heading\n<script>alert(1)</script>" },
    ]);
  });
  it("groups adjacent list items without merging separate lists", () => {
    expect(documentBlocks("- One\n- Two\n\n- Three")).toEqual([
      { type: "list", text: "One\nTwo", ordered: false },
      { type: "list", text: "Three", ordered: false },
    ]);
  });
  it("keeps incomplete code fences readable and blank canvases empty", () => {
    expect(documentBlocks("```\nunfinished")).toEqual([
      { type: "code", text: "unfinished" },
    ]);
    expect(documentBlocks(" \n\n")).toEqual([]);
  });
});
