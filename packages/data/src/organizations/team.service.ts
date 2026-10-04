import { sql } from "drizzle-orm";
import type { OrganizationMembership } from "@workos-inc/node";
import { z } from "zod";
import type { Database } from "../db";
import { ApiError } from "../errors";
import type { OrganizationActor, TeamAction, TeamData } from "./contracts";
import { requireOrganizationMember } from "./membership";
import { getWorkOS } from "./workos";

function isAdmin(membership: OrganizationMembership) {
  return (
    membership.role.slug === "admin" ||
    membership.roles?.some((role) => role.slug === "admin")
  );
}

export class TeamService {
  constructor(private readonly dependencies: { db: Database }) {}

  private async memberships(organizationId: string) {
    const result = await getWorkOS().userManagement.listOrganizationMemberships(
      {
        organizationId,
        statuses: ["active"],
        limit: 100,
      },
    );
    return (await result.autoPagination()).filter(
      (membership) =>
        membership.organizationId === organizationId &&
        membership.status === "active",
    );
  }

  async list(actor: OrganizationActor): Promise<TeamData> {
    const membership = await requireOrganizationMember(
      this.dependencies.db,
      actor,
    );
    const workos = getWorkOS();
    const [memberships, invitations] = await Promise.all([
      this.memberships(actor.organizationId),
      (
        await workos.userManagement.listInvitations({
          organizationId: actor.organizationId,
          limit: 100,
        })
      ).autoPagination(),
    ]);
    const members: TeamData["members"] = [];
    // Keep identity requests bounded for larger teams.
    for (const row of memberships) {
      const user = await workos.userManagement.getUser(row.userId);
      members.push({
        id: row.id,
        userId: row.userId,
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email,
        email: user.email,
        picture: user.profilePictureUrl ?? null,
        role: isAdmin(row) ? "admin" : "member",
        directoryManaged: row.directoryManaged,
      });
    }
    return {
      canManageMembers: Boolean(isAdmin(membership)),
      members,
      invitations: invitations
        .filter(
          (row) =>
            row.organizationId === actor.organizationId &&
            row.state === "pending" &&
            new Date(row.expiresAt) > new Date(),
        )
        .map(({ id, email, expiresAt }) => ({ id, email, expiresAt })),
    };
  }

  async act(actor: OrganizationActor, action: TeamAction) {
    const workos = getWorkOS();
    if (action.action === "invite") {
      await requireOrganizationMember(this.dependencies.db, actor);
      const email = z.email().max(254).parse(action.email.trim());
      await workos.userManagement.sendInvitation({
        email,
        organizationId: actor.organizationId,
        inviterUserId: actor.userId,
        roleSlug: "member",
      });
      return;
    }
    if (action.action === "resend") {
      await requireOrganizationMember(this.dependencies.db, actor);
      const invitation = await workos.userManagement.getInvitation(
        action.invitationId,
      );
      if (
        invitation.organizationId !== actor.organizationId ||
        invitation.state !== "pending"
      )
        throw new ApiError(404, "Pending invitation not found.");
      await workos.userManagement.resendInvitation(invitation.id);
      return;
    }
    await this.dependencies.db.transaction(async (tx) => {
      // Serialize provider mutations across Worker instances, not just this process.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`team:${actor.organizationId}`}, 0))`,
      );
      const membership = await requireOrganizationMember(tx, actor);
      if (!isAdmin(membership))
        throw new ApiError(
          403,
          "Only admins can change roles or remove members.",
        );
      if (action.action === "revoke") {
        const invitation = await workos.userManagement.getInvitation(
          action.invitationId,
        );
        if (
          invitation.organizationId !== actor.organizationId ||
          invitation.state !== "pending"
        )
          throw new ApiError(404, "Pending invitation not found.");
        await workos.userManagement.revokeInvitation(invitation.id);
        return;
      }
      const memberships = await this.memberships(actor.organizationId);
      const target = memberships.find((row) => row.id === action.membershipId);
      if (!target) throw new ApiError(404, "Member not found.");
      if (target.directoryManaged)
        throw new ApiError(
          409,
          "Manage this member through your identity provider.",
        );
      const losesAdmin = action.action === "remove" || action.role === "member";
      if (
        isAdmin(target) &&
        losesAdmin &&
        memberships.filter(isAdmin).length <= 1
      )
        throw new ApiError(
          409,
          "Keep at least one admin. Promote another member first.",
        );
      if (action.action === "remove")
        await workos.userManagement.deactivateOrganizationMembership(target.id);
      else
        await workos.userManagement.updateOrganizationMembership(target.id, {
          roleSlug: action.role,
        });
    });
  }
}
