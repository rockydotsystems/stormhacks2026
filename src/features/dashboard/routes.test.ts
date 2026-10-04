import { describe, expect, it } from "vitest";
import {
  dashboardPaths,
  dashboardRoute,
  documentPath,
  projectPath,
} from "./routes";

describe("dashboard URLs", () => {
  it("gives each workspace view its own path", () => {
    expect(new Set(Object.values(dashboardPaths)).size).toBe(3);
    for (const [view, path] of Object.entries(dashboardPaths)) {
      expect(dashboardRoute(path)).toEqual({
        view,
        projectId: null,
        documentId: null,
      });
    }
  });

  it.each([
    "11111111-1111-4111-8111-111111111111",
    "a space",
    "a/b",
    "100%",
    "日本語",
  ])("round-trips project and document IDs: %s", (id) => {
    expect(dashboardRoute(projectPath(id))).toEqual({
      view: "Projects",
      projectId: id,
      documentId: null,
    });
    expect(dashboardRoute(documentPath(id))).toEqual({
      view: "Documents",
      projectId: null,
      documentId: id,
    });
    expect(projectPath(id)).not.toBe(documentPath(id));
  });

  it("does not crash on malformed resource escapes", () => {
    expect(dashboardRoute("/projects/%").projectId).toBe("%");
    expect(dashboardRoute("/documents/%E0%A4%A").documentId).toBe("%E0%A4%A");
  });

  it("does not treat settings as a resource", () => {
    expect(dashboardRoute("/settings/profile")).toEqual({
      view: "Overview",
      projectId: null,
      documentId: null,
    });
  });
});
