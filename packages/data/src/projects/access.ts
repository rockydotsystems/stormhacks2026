import { and, eq, isNull } from "drizzle-orm";
import type { OrganizationActor } from "../organizations/contracts";
import { requireOrganizationMember } from "../organizations/membership";
import { projects } from "./schema";
import type { Database } from "../db";
import { ApiError } from "../errors";

export async function requireProject(
  db: Pick<Database, "select" | "insert">,
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
        isNull(projects.deletedAt),
      ),
    );
  const [project] = await (lock ? query.for("update") : query);
  if (!project) throw new ApiError(404, "Project not found.");
  return project;
}
