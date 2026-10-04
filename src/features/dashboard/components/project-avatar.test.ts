import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectAvatar } from "./project-avatar";

function render(projectId: string) {
  return renderToStaticMarkup(createElement(ProjectAvatar, { projectId }));
}

describe("ProjectAvatar", () => {
  it("renders the same image for the same project across renders", () => {
    const original = render("project-one");
    render("project-two");
    expect(render("project-one")).toBe(original);
  });

  it("generates different artwork for different projects", () => {
    expect(render("project-one")).not.toBe(render("project-two"));
  });

  it("renders decorative shapes without letters, initials, or external images", () => {
    const image = render("Project with characters <>&");
    expect(image).toContain('aria-hidden="true"');
    expect(image).toContain("<circle");
    expect(image).not.toMatch(/<text|<image|Project with characters/);
  });
});
