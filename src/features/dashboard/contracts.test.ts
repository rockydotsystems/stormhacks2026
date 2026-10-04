import { expect, it } from "vitest";
import { dashboardActionSchema } from "./contracts";

it("creates a named plan with optional context, without client-authored document content", () => {
  const input = {
    action: "createDocument",
    organizationId: "org_test",
    projectId: "00000000-0000-4000-8000-000000000001",
    title: "Search plan",
  };
  expect(dashboardActionSchema.parse(input)).toMatchObject({ description: "" });
  const parsed = dashboardActionSchema.parse({
    ...input,
    description: "  Search incidents  ",
    content: "Must not become the document",
  });
  expect(parsed).toMatchObject({ description: "Search incidents" });
  expect(parsed).not.toHaveProperty("content");
});
