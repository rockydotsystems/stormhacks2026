import { eq } from "drizzle-orm";
import { z } from "zod";
import type { OrganizationActor } from "./contracts";
import { requireOrganizationMember } from "./membership";
import { organizationMembers, organizations, users } from "./schema";
import type { Database } from "../db";

export class OrganizationsService {
  constructor(private readonly dependencies: { db: Database }) {}

  async create(userId: string, name: string) {
    const parsedName = z.string().trim().min(1).parse(name);
    return this.dependencies.db.transaction(async (tx) => {
      await tx.insert(users).values({ id: userId }).onConflictDoNothing();
      const [organization] = await tx
        .insert(organizations)
        .values({ name: parsedName })
        .returning();
      await tx
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId });
      return {
        ...organization,
        createdAt: organization.createdAt.toISOString(),
      };
    });
  }

  async list(userId: string) {
    const rows = await this.dependencies.db
      .select({
        id: organizations.id,
        name: organizations.name,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.organizationId, organizations.id),
      )
      .where(eq(organizationMembers.userId, userId));
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addMember(actor: OrganizationActor, userId: string) {
    return this.dependencies.db.transaction(async (tx) => {
      await requireOrganizationMember(tx, actor);
      await tx.insert(users).values({ id: userId }).onConflictDoNothing();
      await tx
        .insert(organizationMembers)
        .values({ organizationId: actor.organizationId, userId })
        .onConflictDoNothing();
    });
  }
}
