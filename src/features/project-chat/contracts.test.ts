import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { askChatSchema, createChatSchema, projectChatPath } from "./contracts";
import { dashboardRoute } from "@/features/dashboard/routes";

describe("project chat contracts", () => {
  const scope = { organizationId: "org_test", projectId: randomUUID() };
  it("opens project-scoped chat URLs without losing project context", () => {
    const id = randomUUID();
    const path = projectChatPath(scope.projectId, id);
    expect(path).toBe(`/projects/${scope.projectId}/chats/${id}`);
    expect(dashboardRoute(path).projectId).toBe(scope.projectId);
  });
  it("requires bounded questions and a stable retry ID; defaults to text", () => {
    expect(createChatSchema.parse(scope).title).toBe("New chat");
    expect(
      askChatSchema.parse({
        ...scope,
        content: " Why? ",
        clientMessageId: randomUUID(),
      }),
    ).toMatchObject({ content: "Why?", via: "text" });
    expect(
      askChatSchema.safeParse({
        ...scope,
        content: "",
        clientMessageId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(askChatSchema.safeParse({ ...scope, content: "Why?" }).success).toBe(
      false,
    );
    expect(
      askChatSchema.safeParse({
        ...scope,
        content: "a".repeat(8001),
        clientMessageId: randomUUID(),
      }).success,
    ).toBe(false);
  });
});
