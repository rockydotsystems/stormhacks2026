import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkOS } from "@stormhacks/data/organizations/workos";
import { PipesTokens } from "./pipes";

const getAccessToken = vi.fn();
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => ({ pipes: { getAccessToken } }),
}));

const active = (accessToken: string, missingScopes: string[] = []) => ({
  active: true as const,
  accessToken: {
    object: "access_token" as const,
    accessToken,
    expiresAt: null,
    scopes: [],
    missingScopes,
  },
});

describe("PipesTokens", () => {
  beforeEach(() => {
    getAccessToken.mockReset();
  });

  it("asks WorkOS for the linear provider scoped to the organization first", async () => {
    getAccessToken.mockResolvedValue(active("tok"));
    expect(await new PipesTokens().get("user_1", "org_1")).toBe("tok");
    expect(getAccessToken).toHaveBeenCalledWith({
      provider: "linear",
      userId: "user_1",
      organizationId: "org_1",
    });
    expect(getWorkOS).toBeDefined();
  });

  it("falls back to the user-level connection", async () => {
    getAccessToken
      .mockResolvedValueOnce({ active: false, error: "not_installed" })
      .mockResolvedValueOnce(active("user-level"));
    expect(await new PipesTokens().get("user_1", "org_1")).toBe("user-level");
    expect(getAccessToken.mock.calls[1][0].organizationId).toBeNull();
  });

  it("asks for reauthorization or a first connection", async () => {
    getAccessToken.mockResolvedValue({
      active: false,
      error: "needs_reauthorization",
    });
    await expect(new PipesTokens().get("u", "o")).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/authorized again/),
    });
    getAccessToken.mockResolvedValue({ active: false, error: "not_installed" });
    await expect(new PipesTokens().get("u", "o")).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/not connected/),
    });
  });

  it("rejects a connection that lacks the requested scopes", async () => {
    getAccessToken.mockResolvedValue(active("tok", ["write"]));
    await expect(new PipesTokens().get("u", "o")).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/write/),
    });
  });

  it("treats a WorkOS outage as retryable, not a missing connection", async () => {
    getAccessToken.mockRejectedValue(new Error("down"));
    await expect(new PipesTokens().get("u", "o")).rejects.toMatchObject({
      status: 502,
    });
  });
});
