import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSlackBinding, slackBindings } from "./config";

const binding = {
  teamId: "T123",
  channelId: "C123",
  organizationId: "org_123",
  projectId: "00000000-0000-4000-8000-000000000001",
  users: { U123: "user_123" },
};
afterEach(() => vi.unstubAllEnvs());
describe("Slack channel authorization", () => {
  it("resolves only explicitly mapped users in the bound workspace and channel", () => {
    vi.stubEnv("SLACK_BINDINGS", JSON.stringify([binding]));
    expect(resolveSlackBinding("T123", "C123", "U123")?.actor).toEqual({
      organizationId: "org_123",
      userId: "user_123",
    });
    expect(resolveSlackBinding("T999", "C123", "U123")).toBeNull();
    expect(resolveSlackBinding("T123", "C999", "U123")).toBeNull();
    expect(resolveSlackBinding("T123", "C123", "U999")).toBeNull();
  });
  it("fails closed on invalid or ambiguous configuration", () => {
    expect(() => slackBindings(JSON.stringify([binding, binding]))).toThrow();
    expect(() => slackBindings("not json")).toThrow();
    expect(() =>
      slackBindings(
        JSON.stringify([{ ...binding, projectId: "not-a-project" }]),
      ),
    ).toThrow();
  });
});
