import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { OrganizationActor } from "@/features/organizations/contracts";
import { personalWorkspaces } from "@/features/planning/server/schema";
import {
  organizationMembers,
  organizations,
  users,
} from "@/features/organizations/server/schema";
import type { Database } from "@/server/db";

export interface ActorResolver {
  resolveActor(
    userId: string,
    profile?: { displayName?: string },
  ): Promise<OrganizationActor>;
}

// Until real organizations arrive, each user works inside one hidden personal organization.
// It is an ordinary organization row plus a membership, so the data layer's tenancy checks hold.
// Nothing is cached here: the service is request scoped and identity comes from the caller.
export class WorkspaceContext implements ActorResolver {
  constructor(private readonly dependencies: { db: Database }) {}

  async resolveActor(
    userId: string,
    profile?: { displayName?: string },
  ): Promise<OrganizationActor> {
    const id = z.string().min(1).parse(userId);
    const { db } = this.dependencies;

    const existing = await this.find(db, id);
    if (existing) return { userId: id, organizationId: existing };

    const name = profile?.displayName?.trim().slice(0, 80);
    const organizationId = await db.transaction(async (tx) => {
      // Serializes concurrent first requests for the same user. The primary key on
      // personal_workspaces is the backstop if this lock were ever skipped.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`personal-workspace:${id}`}))`,
      );
      const raced = await this.find(tx, id);
      if (raced) return raced;
      await tx.insert(users).values({ id }).onConflictDoNothing();
      const [organization] = await tx
        .insert(organizations)
        .values({ name: name ? `${name}'s workspace` : "Personal workspace" })
        .returning();
      await tx
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId: id });
      await tx
        .insert(personalWorkspaces)
        .values({ userId: id, organizationId: organization.id });
      return organization.id;
    });
    return { userId: id, organizationId };
  }

  private async find(
    db: Pick<Database, "select">,
    userId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select({ organizationId: personalWorkspaces.organizationId })
      .from(personalWorkspaces)
      .where(eq(personalWorkspaces.userId, userId));
    return row?.organizationId ?? null;
  }
}
