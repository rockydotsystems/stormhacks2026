import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWorkOS } from "../../../../tests/workos";
import type { Database } from "../db";
import { TeamService } from "./team.service";
import { OrganizationsService } from "./organizations.service";

const workos = fakeWorkOS();
const sendInvitation = vi
  .fn()
  .mockResolvedValue({ token: "never-return-this" });
const listInvitations = vi.fn();
const getInvitation = vi.fn();
const resendInvitation = vi.fn();
const revokeInvitation = vi.fn();
vi.mock("./workos", () => ({
  getWorkOS: () => ({
    ...workos,
    userManagement: {
      ...workos.userManagement,
      sendInvitation,
      listInvitations,
      getInvitation,
      resendInvitation,
      revokeInvitation,
    },
  }),
}));

describe("WorkOS teams", () => {
  let service: TeamService;
  let actor: { userId: string; organizationId: string };
  let member: Awaited<
    ReturnType<typeof workos.userManagement.createOrganizationMembership>
  >;
  let admin: typeof member;
  const execute = vi.fn();
  const insert = vi.fn(() => ({
    values: () => ({
      onConflictDoNothing: async () => {},
      onConflictDoUpdate: async () => {},
    }),
  }));
  const transaction = vi.fn();
  const db = { insert, execute, transaction } as unknown as Database;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    listInvitations.mockResolvedValue({ autoPagination: async () => [] });
    transaction.mockImplementation((fn) => fn(db));
    const organization = await new OrganizationsService({ db }).create(
      "creator",
      "Workspace",
    );
    actor = { userId: "creator", organizationId: organization.id };
    member = await workos.userManagement.createOrganizationMembership({
      organizationId: organization.id,
      userId: "manager-without-github",
    });
    admin = (
      await workos.userManagement.listOrganizationMemberships({
        ...actor,
        statuses: ["active"],
      })
    ).data[0];
    service = new TeamService({ db });
  });

  it("creates an admin, not an owner, for a new workspace", () => {
    expect(admin.role.slug).toBe("admin");
  });

  it("includes WorkOS profile photos and a null fallback in the member roster", async () => {
    const picture = "https://workoscdn.com/profile.jpg";
    vi.spyOn(workos.userManagement, "getUser").mockImplementation(
      async (id) => ({
        id,
        email: `${id}@example.com`,
        firstName: null,
        lastName: null,
        profilePictureUrl: id === actor.userId ? picture : null,
      }),
    );
    const { members } = await service.list(actor);
    expect(members.find((row) => row.userId === actor.userId)?.picture).toBe(
      picture,
    );
    expect(
      members.find((row) => row.userId === member.userId)?.picture,
    ).toBeNull();
  });

  it("lets a non-GitHub member read the roster and invite only as a member", async () => {
    const manager = { ...actor, userId: member.userId };
    const data = await service.list(manager);
    expect(data.canManageMembers).toBe(false);
    expect(data.members).toHaveLength(2);
    await service.act(manager, {
      action: "invite",
      email: " teammate@example.com ",
    });
    expect(sendInvitation).toHaveBeenCalledWith({
      email: "teammate@example.com",
      organizationId: actor.organizationId,
      inviterUserId: member.userId,
      roleSlug: "member",
    });
    expect(data).not.toHaveProperty("token");
  });

  it.each(["admin", "member"] as const)(
    "rejects role changes by a non-admin: %s",
    async (role) => {
      await expect(
        service.act(
          { ...actor, userId: member.userId },
          { action: "role", membershipId: admin.id, role },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(admin.role.slug).toBe("admin");
    },
  );

  it("rejects removal by a non-admin", async () => {
    await expect(
      service.act(
        { ...actor, userId: member.userId },
        { action: "remove", membershipId: admin.id },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(admin.status).toBe("active");
  });

  it.each(["role", "remove"] as const)(
    "cannot %s the last admin, including self",
    async (action) => {
      const input =
        action === "role"
          ? { action, membershipId: admin.id, role: "member" as const }
          : { action, membershipId: admin.id };
      await expect(service.act(actor, input)).rejects.toMatchObject({
        status: 409,
      });
      expect(admin.role.slug).toBe("admin");
      expect(admin.status).toBe("active");
      expect(execute).toHaveBeenCalledOnce();
    },
  );

  it("allows promoting another member then demoting oneself; rechecks stale admin rights", async () => {
    await service.act(actor, {
      action: "role",
      membershipId: member.id,
      role: "admin",
    });
    await service.act(actor, {
      action: "role",
      membershipId: admin.id,
      role: "member",
    });
    expect(admin.role.slug).toBe("member");
    expect(member.role.slug).toBe("admin");
    await expect(
      service.act(actor, { action: "remove", membershipId: member.id }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("deactivates membership without deleting identity or contributions", async () => {
    await service.act(actor, { action: "remove", membershipId: member.id });
    expect(member.status).toBe("inactive");
    await expect(
      service.list({ ...actor, userId: member.userId }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("does not mutate a membership belonging to another organization", async () => {
    const outsider = await workos.userManagement.createOrganizationMembership({
      organizationId: "org_other",
      userId: "outsider",
    });
    await expect(
      service.act(actor, { action: "remove", membershipId: outsider.id }),
    ).rejects.toMatchObject({ status: 404 });
    expect(outsider.status).toBe("active");
  });

  it("blocks directory-managed changes rather than promising durable manual roles", async () => {
    member.directoryManaged = true;
    await expect(
      service.act(actor, {
        action: "role",
        membershipId: member.id,
        role: "admin",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("returns only pending invitations without acceptance tokens or URLs", async () => {
    const pending = {
      id: "invitation_pending",
      organizationId: actor.organizationId,
      email: "teammate@example.com",
      state: "pending",
      expiresAt: "2099-01-01T00:00:00Z",
      token: "private-token",
      acceptInvitationUrl: "https://private.test/token",
    };
    listInvitations.mockResolvedValue({
      autoPagination: async () => [
        pending,
        { ...pending, id: "accepted", state: "accepted" },
        { ...pending, id: "foreign", organizationId: "org_foreign" },
        { ...pending, id: "expired", expiresAt: "2000-01-01T00:00:00Z" },
      ],
    });
    expect((await service.list(actor)).invitations).toEqual([
      { id: pending.id, email: pending.email, expiresAt: pending.expiresAt },
    ]);
  });

  it("lets members resend but only admins revoke invitations", async () => {
    getInvitation.mockResolvedValue({
      id: "invitation_pending",
      organizationId: actor.organizationId,
      state: "pending",
    });
    const manager = { ...actor, userId: member.userId };
    await service.act(manager, {
      action: "resend",
      invitationId: "invitation_pending",
    });
    expect(resendInvitation).toHaveBeenCalledWith("invitation_pending");
    await expect(
      service.act(manager, {
        action: "revoke",
        invitationId: "invitation_pending",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(revokeInvitation).not.toHaveBeenCalled();
    await service.act(actor, {
      action: "revoke",
      invitationId: "invitation_pending",
    });
    expect(revokeInvitation).toHaveBeenCalledWith("invitation_pending");
  });

  it.each(["resend", "revoke"] as const)(
    "cannot %s another organization's invitation",
    async (action) => {
      getInvitation.mockResolvedValue({
        id: "invitation_other",
        organizationId: "org_other",
        state: "pending",
      });
      await expect(
        service.act(actor, { action, invitationId: "invitation_other" }),
      ).rejects.toMatchObject({ status: 404 });
      expect(resendInvitation).not.toHaveBeenCalled();
      expect(revokeInvitation).not.toHaveBeenCalled();
    },
  );
});
