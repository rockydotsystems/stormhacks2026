import { describe, expect, it } from "vitest";
import {
  changeIdSchema,
  githubRepositorySchema,
  snapshotSchema,
} from "@/features/docs/contracts";

describe("docs input contracts", () => {
  it("accepts full snapshots, including empty markdown, but requires a title", () => {
    expect(snapshotSchema.parse({ title: " ADR title ", content: "" })).toEqual(
      { title: "ADR title", content: "" },
    );
    expect(
      snapshotSchema.safeParse({ title: " ", content: "text" }).success,
    ).toBe(false);
  });

  it("normalizes GitHub identity without accepting URLs or path traversal", () => {
    expect(
      githubRepositorySchema.parse({
        owner: "RockyDotSystems",
        name: "StormHacks2026",
      }),
    ).toEqual({ owner: "rockydotsystems", name: "stormhacks2026" });
    for (const name of ["../repo", ".", "..", "https://github.com/org/repo"]) {
      expect(
        githubRepositorySchema.safeParse({ owner: "org", name }).success,
      ).toBe(false);
    }
  });

  it("validates bigint snapshot IDs without converting them to unsafe JS numbers", () => {
    expect(changeIdSchema.parse("9223372036854775807")).toBe(
      "9223372036854775807",
    );
    for (const value of ["0", "-1", "1.5", "01", "9223372036854775808"]) {
      expect(changeIdSchema.safeParse(value).success).toBe(false);
    }
  });
});
