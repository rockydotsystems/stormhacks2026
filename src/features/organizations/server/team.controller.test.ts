import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamController } from "./team.controller";
import type { Dependencies } from "@/server/container";

const requireUser = vi.fn();
const list = vi.fn();
const act = vi.fn();
const controller = new TeamController({
  authService: { requireUser },
  teamService: { list, act },
} as unknown as Dependencies);
const organizationId = "org_example";
function request(body: unknown) {
  return new Request("https://app.test/api/organizations/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("team API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireUser.mockResolvedValue({ id: "user_signedin" });
    list.mockResolvedValue({
      members: [],
      invitations: [],
      canManageMembers: false,
    });
  });

  it("binds every mutation to the authenticated identity, not a submitted user ID", async () => {
    const response = await controller.act(
      request({
        action: "role",
        organizationId,
        membershipId: "om_target",
        role: "admin",
        userId: "user_spoofed",
      }),
    );
    expect(act).toHaveBeenCalledWith(
      { organizationId, userId: "user_signedin" },
      { action: "role", membershipId: "om_target", role: "admin" },
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    { action: "role", membershipId: "om_target", role: "owner" },
    { action: "invite", email: "invalid" },
    { action: "remove", membershipId: "not-a-workos-id" },
  ])("rejects invalid team actions: $action", async (body) => {
    await expect(
      controller.act(request({ ...body, organizationId })),
    ).rejects.toMatchObject({ status: 400 });
    expect(act).not.toHaveBeenCalled();
  });

  it("requires sign-in before accessing the provider", async () => {
    requireUser.mockRejectedValue({ status: 401 });
    await expect(
      controller.list(
        new Request(
          `https://app.test/api/organizations/team?organizationId=${organizationId}`,
        ),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(list).not.toHaveBeenCalled();
  });

  it("does not let invitation callers choose an admin or owner role", async () => {
    await controller.act(
      request({
        action: "invite",
        organizationId,
        email: "teammate@example.com",
        role: "admin",
      }),
    );
    expect(act).toHaveBeenCalledWith(
      { organizationId, userId: "user_signedin" },
      { action: "invite", email: "teammate@example.com" },
    );
  });
});
