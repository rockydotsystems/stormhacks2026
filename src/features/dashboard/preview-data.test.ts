import { describe, expect, it } from "vitest";
import { filterDecisions, initialDecisions } from "./preview-data";

const defaults = {
  organization: "Rocky Dot Systems",
  query: "",
  status: "All statuses",
  collection: "All collections",
  view: "Documents",
  sort: "Last updated",
};

describe("dashboard document filters", () => {
  it("keeps organization documents separate", () => {
    expect(filterDecisions(initialDecisions, defaults)).toHaveLength(8);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        organization: "Rocky Dot Labs",
      }).map((document) => document.id),
    ).toEqual(["labs-001"]);
  });
  it("combines search, status, and collection filters", () => {
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        query: "  HYPERDRIVE  ",
        status: "In review",
        collection: "Infrastructure",
      }).map((document) => document.id),
    ).toEqual(["adr-005"]);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        query: "no matching title",
      }),
    ).toEqual([]);
  });
  it("shows only pending reviews requested from the current member", () => {
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        view: "My reviews",
      }).map((document) => document.id),
    ).toEqual(["adr-008", "adr-005"]);
  });
  it("filters personal and bound views and sorts without mutating the source", () => {
    expect(
      filterDecisions(initialDecisions, { ...defaults, view: "Created by me" }),
    ).toHaveLength(2);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        view: "Bound decisions",
      }),
    ).toHaveLength(4);
    const sorted = filterDecisions(initialDecisions, {
      ...defaults,
      sort: "Name",
    });
    expect(sorted[0].title).toBe("Advisory reviews for GitHub pull requests");
    expect(initialDecisions[0].id).toBe("adr-008");
  });
});
