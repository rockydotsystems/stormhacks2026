import { describe, expect, it } from "vitest";
import type { DocChange, DocVersion } from "@/features/docs/contracts";
import type { DocumentData } from "../contracts";
import { historyEntries, previousChange, publishState } from "./history";

function change(id: number, content = `body ${id}`): DocChange {
  return {
    id: String(id),
    docId: "d",
    number: id,
    title: `Title ${id}`,
    content,
    immutable: false,
    proposed: false,
    createdBy: "u",
    createdAt: "2026-10-03T00:00:00Z",
  };
}
function version(number: number, changeId: number): DocVersion {
  return {
    id: `v${number}`,
    docId: "d",
    changeId: String(changeId),
    number,
    label: `v${number}`,
    publishedBy: "u",
    publishedAt: "2026-10-03T00:00:00Z",
  };
}
const data = (
  changes: number[],
  versions: [number, number][],
): DocumentData => ({
  changes: changes.map((id) => change(id)),
  versions: versions.map(([number, id]) => version(number, id)),
});

describe("publishState", () => {
  it("is a draft until something is published", () => {
    expect(publishState(data([1, 2], [])).kind).toBe("draft");
  });
  it("is published when the newest change is the newest version", () => {
    expect(publishState(data([1, 2], [[1, 2]])).kind).toBe("published");
  });
  it("counts changes after the newest version", () => {
    expect(publishState(data([1, 2, 3, 4], [[1, 2]]))).toMatchObject({
      kind: "edited",
      unpublished: 2,
    });
  });
});

describe("historyEntries", () => {
  it("lists the draft first, then versions newest first, each with its own changes", () => {
    const entries = historyEntries(
      data(
        [1, 2, 3, 4, 5],
        [
          [1, 2],
          [2, 4],
        ],
      ),
    );
    expect(entries.map((entry) => entry.key)).toEqual(["draft", 2, 1]);
    expect(entries.map((entry) => entry.changes.map((c) => c.id))).toEqual([
      ["5"],
      ["3", "4"],
      ["1", "2"],
    ]);
  });

  it("compares each entry with the previous version", () => {
    const [draft, v2, v1] = historyEntries(
      data(
        [1, 2, 3, 4, 5],
        [
          [1, 2],
          [2, 4],
        ],
      ),
    );
    expect(draft.base?.id).toBe("4");
    expect(v2.base?.id).toBe("2");
    expect(v1.base).toBeNull();
    expect(v2.head?.id).toBe("4");
  });

  it("has no draft entry when everything is published", () => {
    expect(historyEntries(data([1, 2], [[1, 2]])).map((e) => e.key)).toEqual([
      1,
    ]);
  });
});

describe("previousChange", () => {
  it("steps back one snapshot, and stops at the first", () => {
    const d = data([1, 2, 3], []);
    expect(previousChange(d, d.changes[2])?.id).toBe("2");
    expect(previousChange(d, d.changes[0])).toBeNull();
  });
});
