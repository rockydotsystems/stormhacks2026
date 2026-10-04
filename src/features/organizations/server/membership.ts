import "server-only";
import { and, eq } from "drizzle-orm";
import type { OrganizationActor } from "@/features/organizations/contracts";
import { organizationMembers } from "@/features/organizations/server/schema";
import type { Database } from "@/server/db";
import { ApiError } from "@/server/errors";

export async function requireOrganizationMember(
  db: Pick<Database, "select">,
  actor: OrganizationActor,
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, actor.organizationId),
        eq(organizationMembers.userId, actor.userId),
      ),
    );
  if (!member) throw new ApiError(404, "Organization not found.");
}
