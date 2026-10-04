import { describe, expect, it } from "vitest";
import { projectFolderColors } from "./project-folder-colors";

describe("projectFolderColors", () => {
  it("keeps project colors stable independently of render order", () => {
    const original = projectFolderColors("project-one");
    projectFolderColors("project-two");
    expect(projectFolderColors("project-one")).toEqual(original);
  });

  it("gives different projects different hues", () => {
    expect(projectFolderColors("project-one")).not.toEqual(
      projectFolderColors("project-two"),
    );
  });

  it("keeps every color pale and softly saturated", () => {
    for (const projectId of ["project-one", "project-two", "", "🌱"]) {
      for (const color of Object.values(projectFolderColors(projectId))) {
        const [, hue, saturation, lightness] = color.match(
          /^hsl\((\d+) (\d+)% (\d+)%\)$/,
        )!;
        expect(Number(hue)).toBeLessThan(360);
        expect(Number(saturation)).toBeLessThanOrEqual(45);
        expect(Number(lightness)).toBeGreaterThanOrEqual(78);
      }
    }
  });
});
