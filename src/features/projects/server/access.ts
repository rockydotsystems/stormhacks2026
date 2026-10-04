import "server-only";
import { and, eq } from "drizzle-orm";
import type { OrganizationActor } from "@/features/organizations/contracts";
import { requireOrganizationMember } from "@/features/organizations/server/membership";
import { projects } from "@/features/projects/server/schema";
import type { Database } from "@/server/db";
import { ApiError } from "@/server/errors";

export async function requireProject(
  db: Pick<Database, "select">,
  actor: OrganizationActor,
  projectId: string,
  lock = false,
) {
  await requireOrganizationMember(db, actor);
  const query = db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, actor.organizationId),
      ),
    );
  const [project] = await (lock ? query.for("update") : query);
  if (!project) throw new ApiError(404, "Project not found.");
  return project;
}
