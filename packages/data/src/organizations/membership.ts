import { and, eq } from "drizzle-orm";
import type { OrganizationActor } from "./contracts";
import { organizationMembers } from "./schema";
import type { Database } from "../db";
import { ApiError } from "../errors";

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
