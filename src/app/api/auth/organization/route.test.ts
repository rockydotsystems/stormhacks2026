import { asValue } from "awilix";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { container } from "@/server/container";
import { ApiError } from "@/server/errors";
const { memberships, refreshSession, getSignInUrl } = vi.hoisted(() => ({
  memberships: vi.fn(),
  refreshSession: vi.fn(),
  getSignInUrl: vi.fn(),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({
    userManagement: { listOrganizationMemberships: memberships },
  }),
  refreshSession,
  getSignInUrl,
}));
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => ({
    userManagement: { listOrganizationMemberships: memberships },
  }),
}));
const requireUser = vi.fn();
const insert = vi.fn(() => ({
  values: () => ({ onConflictDoNothing: vi.fn() }),
}));
const organizationId = "org_testOrganization";
function request(id = organizationId) {
  return new Request("http://localhost/api/auth/organization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: id, userId: "forged-user" }),
  });
}
describe("WorkOS organization switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container.register({
      authService: asValue({ requireUser }),
      db: asValue({ insert }),
    });
    requireUser.mockResolvedValue({ id: "user-a" });
    memberships.mockResolvedValue({
      data: [{ userId: "user-a", organizationId, status: "active" }],
    });
    refreshSession.mockResolvedValue({
      user: { id: "user-a" },
      organizationId,
      accessToken: "private-token",
    });
  });
  it("checks the authenticated user's active membership and refreshes the session without returning tokens", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(memberships).toHaveBeenCalledWith({
      organizationId,
      userId: "user-a",
      statuses: ["active"],
      limit: 1,
    });
    expect(refreshSession).toHaveBeenCalledWith({ organizationId });
    expect(await response.json()).toEqual({ organizationId });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each(["inactive", "pending"])(
    "rejects %s membership without refreshing or writing",
    async (status) => {
      memberships.mockResolvedValue({
        data: [{ userId: "user-a", organizationId, status }],
      });
      expect((await POST(request())).status).toBe(404);
      expect(refreshSession).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    },
  );
  it("blocks anonymous and malformed requests", async () => {
    expect((await POST(request("legacy-uuid"))).status).toBe(400);
    requireUser.mockRejectedValue(new ApiError(401, "Sign in to continue."));
    expect((await POST(request())).status).toBe(401);
    expect(memberships).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("returns a hosted sign-in URL when the organization requires SSO", async () => {
    refreshSession.mockRejectedValue(
      new Error("Refresh failed", { cause: { error: "sso_required" } }),
    );
    getSignInUrl.mockResolvedValue("https://auth.example.com/sign-in");
    expect(await (await POST(request())).json()).toEqual({
      redirectUrl: "https://auth.example.com/sign-in",
    });
    expect(getSignInUrl).toHaveBeenCalledWith({
      organizationId,
      returnTo: "/",
    });
  });
  it("reports refresh failures without exposing credentials", async () => {
    refreshSession.mockRejectedValue(new Error("private-refresh-token"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Could not switch organizations. Please try again.",
    });
  });
});
