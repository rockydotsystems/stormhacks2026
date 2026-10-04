import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { OrganizationActor } from "@/features/organizations/contracts";
import { personalWorkspaces } from "@/features/planning/server/schema";
import {
  organizationMembers,
  users,
} from "@/features/organizations/server/schema";
import type { Database } from "@/server/db";

export interface ActorResolver {
  resolveActor(
    userId: string,
    profile?: { displayName?: string },
  ): Promise<OrganizationActor>;
}

// Use an active WorkOS organization, creating a personal one if this user has none.
// Local membership rows only preserve planning conversation foreign keys.
// Nothing is cached here: the service is request scoped and identity comes from the caller.
export class WorkspaceContext implements ActorResolver {
  constructor(private readonly dependencies: { db: Database }) {}

  async resolveActor(
    userId: string,
    profile?: { displayName?: string },
  ): Promise<OrganizationActor> {
    const id = z.string().min(1).parse(userId);
    const { db } = this.dependencies;

    const name = profile?.displayName?.trim().slice(0, 80);
    const organizationId = await db.transaction(async (tx) => {
      // Serializes concurrent first requests for the same user. The primary key on
      // personal_workspaces is the backstop if this lock were ever skipped.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`personal-workspace:${id}`}))`,
      );
      await tx.insert(users).values({ id }).onConflictDoNothing();
      const service = new OrganizationsService({ db: tx });
      const organization =
        (await service.list(id))[0] ||
        (await service.create(
          id,
          name ? `${name}'s workspace` : "Personal workspace",
        ));
      await tx
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId: id })
        .onConflictDoNothing();
      await tx
        .insert(personalWorkspaces)
        .values({ userId: id, organizationId: organization.id })
        .onConflictDoUpdate({
          target: personalWorkspaces.userId,
          set: { organizationId: organization.id },
        });
      return organization.id;
    });
    return { userId: id, organizationId };
  }
}
