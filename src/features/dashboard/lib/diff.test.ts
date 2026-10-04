import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "./diff";

describe("diffLines", () => {
  it("marks every line of a first version as added", () => {
    expect(diffLines("", "a\nb")).toEqual([
      { kind: "added", text: "a" },
      { kind: "added", text: "b" },
    ]);
  });

  it("keeps unchanged lines and marks edits as a removal then an addition", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([
      { kind: "unchanged", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "unchanged", text: "c" },
    ]);
  });

  it("finds insertions and deletions in the middle of a document", () => {
    const diff = diffLines("a\nb\nc\nd", "a\nc\nx\nd");
    expect(diff.map((line) => `${line.kind[0]}:${line.text}`)).toEqual([
      "u:a",
      "r:b",
      "u:c",
      "a:x",
      "u:d",
    ]);
    expect(diffStats(diff)).toEqual({ added: 1, removed: 1 });
  });

  it("reports no change for identical text, whatever the line endings", () => {
    const diff = diffLines("a\r\nb", "a\nb");
    expect(diffStats(diff)).toEqual({ added: 0, removed: 0 });
  });

  it("still returns a correct diff for very large replacements", () => {
    const before = Array.from({ length: 2500 }, (_, i) => `old ${i}`).join(
      "\n",
    );
    const after = Array.from({ length: 2500 }, (_, i) => `new ${i}`).join("\n");
    expect(diffStats(diffLines(before, after))).toEqual({
      added: 2500,
      removed: 2500,
    });
  });
});
