import { getWorkOS } from "./workos";
import { z } from "zod";
import { organizations, users } from "./schema";
import type { Database } from "../db";

export class OrganizationsService {
  constructor(private readonly dependencies: { db: Database }) {}

  async create(userId: string, name: string) {
    const parsedName = z.string().trim().min(1).max(80).parse(name);
    const workos = getWorkOS();
    const organization = await workos.organizations.createOrganization({
      name: parsedName,
    });
    await workos.userManagement.createOrganizationMembership({
      organizationId: organization.id,
      userId,
      roleSlug: "admin",
    });
    await this.mirror(organization);
    await this.dependencies.db
      .insert(users)
      .values({ id: userId })
      .onConflictDoNothing();
    return organization;
  }

  async list(userId: string) {
    const workos = getWorkOS();
    const memberships = await (
      await workos.userManagement.listOrganizationMemberships({
        userId,
        statuses: ["active"],
      })
    ).autoPagination();
    const rows = await Promise.all(
      memberships.map((membership) =>
        workos.organizations.getOrganization(membership.organizationId),
      ),
    );
    await Promise.all(rows.map((row) => this.mirror(row)));
    return rows;
  }

  private async mirror(organization: {
    id: string;
    name: string;
    createdAt: string;
  }) {
    await this.dependencies.db
      .insert(organizations)
      .values({
        id: organization.id,
        name: organization.name,
        createdAt: new Date(organization.createdAt),
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: { name: organization.name },
      });
  }
}
