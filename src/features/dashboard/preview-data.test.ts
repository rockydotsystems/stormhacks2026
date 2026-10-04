import { describe, expect, it } from "vitest";
import { filterDecisions, initialDecisions } from "./preview-data";

const defaults = {
  organization: "Rocky Dot Systems",
  query: "",
  status: [] as string[],
  project: [] as string[],
  myReviews: false,
  scope: null as string | null,
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
  it("combines search with multi-select status and project filters", () => {
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        query: "  HYPERDRIVE  ",
        status: ["Draft", "In review"],
        project: ["Infrastructure", "Product"],
      }).map((document) => document.id),
    ).toEqual(["adr-005"]);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        status: ["Draft", "In review"],
        project: ["Infrastructure", "Product"],
      }),
    ).toHaveLength(4);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        query: "no matching title",
      }),
    ).toEqual([]);
  });
  it("combines requested reviews with the selected statuses", () => {
    expect(
      filterDecisions(initialDecisions, { ...defaults, myReviews: true }).map(
        (document) => document.id,
      ),
    ).toEqual(["adr-008", "adr-005"]);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        myReviews: true,
        status: ["Published"],
      }),
    ).toEqual([]);
  });
  it("scopes project navigation and sorts without mutating the source", () => {
    expect(
      filterDecisions(initialDecisions, { ...defaults, scope: "Engineering" }),
    ).toHaveLength(3);
    expect(
      filterDecisions(initialDecisions, {
        ...defaults,
        scope: "Engineering",
        project: ["Product"],
      }),
    ).toEqual([]);
    const sorted = filterDecisions(initialDecisions, {
      ...defaults,
      sort: "Name",
    });
    expect(sorted[0].title).toBe("Advisory reviews for GitHub pull requests");
    expect(initialDecisions[0].id).toBe("adr-008");
  });
});
