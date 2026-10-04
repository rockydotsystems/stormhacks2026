import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationAvatar } from "./organization-avatar";

function render(organizationId: string) {
  return renderToStaticMarkup(
    createElement(OrganizationAvatar, { organizationId }),
  );
}

describe("OrganizationAvatar", () => {
  it("renders the same image for the same organization across renders", () => {
    const original = render("org-one");
    render("org-two");
    expect(render("org-one")).toBe(original);
  });

  it("generates different artwork for different organizations", () => {
    expect(render("org-one")).not.toBe(render("org-two"));
  });

  it("renders decorative shapes without letters, initials, or external images", () => {
    const image = render("Organization with characters <>&");
    expect(image).toContain('aria-hidden="true"');
    expect(image).toContain("<circle");
    expect(image).not.toMatch(/<text|<image|Organization with characters/);
  });
});
