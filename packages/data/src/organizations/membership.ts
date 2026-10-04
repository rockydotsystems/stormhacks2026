import type { OrganizationMembership } from "@workos-inc/node";
import { getWorkOS } from "./workos";
import type { OrganizationActor } from "./contracts";
import { organizationMembers, users } from "./schema";
import type { Database } from "../db";
import { ApiError } from "../errors";

export async function requireOrganizationMember(
  db: Pick<Database, "insert">,
  actor: OrganizationActor,
) {
  const memberships =
    await getWorkOS().userManagement.listOrganizationMemberships({
      organizationId: actor.organizationId,
      userId: actor.userId,
      statuses: ["active"],
      limit: 1,
    });
  const membership = memberships.data.find(
    (membership) =>
      membership.status === "active" &&
      membership.organizationId === actor.organizationId &&
      membership.userId === actor.userId,
  );
  if (!membership) throw new ApiError(404, "Organization not found.");
  // New and invited WorkOS users must be present for document creator foreign keys.
  await db.insert(users).values({ id: actor.userId }).onConflictDoNothing();
  // Planning foreign keys need a local mirror; WorkOS remains the access authority.
  await db.insert(organizationMembers).values(actor).onConflictDoNothing();
  return membership;
}

export function isOrganizationAdmin(membership: OrganizationMembership) {
  return (
    membership.role.slug === "admin" ||
    Boolean(membership.roles?.some((role) => role.slug === "admin"))
  );
}

export async function requireOrganizationAdmin(
  db: Pick<Database, "insert">,
  actor: OrganizationActor,
) {
  const membership = await requireOrganizationMember(db, actor);
  if (!isOrganizationAdmin(membership))
    throw new ApiError(403, "Only organization admins can do this.");
  return membership;
}
