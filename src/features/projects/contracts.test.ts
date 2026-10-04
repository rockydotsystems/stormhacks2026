import { describe, expect, it } from "vitest";
import {
  githubRepositorySchema,
  projectSchema,
} from "@/features/projects/contracts";

describe("project input contracts", () => {
  it("requires a project name", () => {
    expect(projectSchema.parse({ name: " Project " })).toEqual({
      name: "Project",
    });
    expect(projectSchema.safeParse({ name: " " }).success).toBe(false);
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
});
