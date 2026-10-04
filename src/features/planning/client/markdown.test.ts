import { describe, expect, it } from "vitest";
import {
  documentFileName,
  parseInline,
  parseMarkdown,
} from "@/features/planning/client/markdown";

describe("parseMarkdown", () => {
  it("parses headings, paragraphs and lists", () => {
    const blocks = parseMarkdown(
      "# Title\n\nFirst line\nsecond line\n\n## Goals\n- one\n- two\n\n1. a\n2. b",
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list",
      "list",
    ]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      inline: [{ type: "text", text: "First line second line" }],
    });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[4]).toMatchObject({ type: "list", ordered: true });
  });

  it("keeps fenced code literal, including markdown and html inside", () => {
    const blocks = parseMarkdown(
      "```ts\n# not a heading\n<b>x</b>\n```\nafter",
    );
    expect(blocks[0]).toEqual({
      type: "code",
      language: "ts",
      text: "# not a heading\n<b>x</b>",
    });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  it("runs an unclosed fence to the end of the document", () => {
    expect(parseMarkdown("```\nline one\nline two")).toEqual([
      { type: "code", language: null, text: "line one\nline two" },
    ]);
  });

  it("passes html through as text, never as markup", () => {
    const [block] = parseMarkdown("<script>alert(1)</script>");
    expect(block).toEqual({
      type: "paragraph",
      inline: [{ type: "text", text: "<script>alert(1)</script>" }],
    });
  });

  it("joins a wrapped list item and splits ordered from bullet lists", () => {
    const blocks = parseMarkdown("- first item\n  continues here\n- second");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "list" });
    if (blocks[0].type === "list") {
      expect(blocks[0].items).toHaveLength(2);
    }
  });

  it("recognizes a horizontal rule", () => {
    expect(parseMarkdown("---")).toEqual([{ type: "rule" }]);
  });

  it("returns nothing for an empty document", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("parses bold, italic and code", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "code", text: "d" },
    ]);
  });

  it("renders a link as plain text with the address visible", () => {
    expect(parseInline("see [docs](https://example.com/x)")).toEqual([
      { type: "text", text: "see " },
      { type: "text", text: "docs (https://example.com/x)" },
    ]);
  });

  it("keeps markers inside code spans literal", () => {
    expect(parseInline("`**x**`")).toEqual([{ type: "code", text: "**x**" }]);
  });

  it("leaves unmatched markers as text", () => {
    expect(parseInline("2 * 3 and a_b")).toEqual([
      { type: "text", text: "2 * 3 and a_b" },
    ]);
  });
});

describe("documentFileName", () => {
  it("builds a safe file name from the title", () => {
    expect(documentFileName("Incident Search / v2!")).toBe(
      "incident-search-v2.md",
    );
    expect(documentFileName("!!!")).toBe("project-plan.md");
  });
});
