import { randomUUID } from "node:crypto";

// In-memory provider boundary for database tests. No live WorkOS resources are created.
export function fakeWorkOS() {
  const organizations = new Map<
    string,
    { id: string; name: string; createdAt: string }
  >();
  const memberships = new Map<
    string,
    {
      id: string;
      userId: string;
      organizationId: string;
      status: string;
      role: { slug: string };
      directoryManaged: boolean;
    }
  >();
  return {
    organizations: {
      async createOrganization({ name }: { name: string }) {
        const organization = {
          id: `org_${randomUUID().replaceAll("-", "")}`,
          name,
          createdAt: new Date().toISOString(),
        };
        organizations.set(organization.id, organization);
        return organization;
      },
      async getOrganization(id: string) {
        return organizations.get(id)!;
      },
    },
    userManagement: {
      async createOrganizationMembership({
        organizationId,
        userId,
        roleSlug = "member",
      }: {
        organizationId: string;
        userId: string;
        roleSlug?: string;
      }) {
        const membership = {
          id: `om_${randomUUID()}`,
          organizationId,
          userId,
          status: "active",
          role: { slug: roleSlug },
          directoryManaged: false,
        };
        memberships.set(`${organizationId}:${userId}`, membership);
        return membership;
      },
      async listOrganizationMemberships({
        organizationId,
        userId,
        statuses,
      }: {
        organizationId?: string;
        userId?: string;
        statuses: string[];
      }) {
        const data = [...memberships.values()].filter(
          (row) =>
            (!organizationId || row.organizationId === organizationId) &&
            (!userId || row.userId === userId) &&
            statuses.includes(row.status),
        );
        return { data, autoPagination: async () => data };
      },
      async updateOrganizationMembership(
        id: string,
        { roleSlug }: { roleSlug: string },
      ) {
        const membership = [...memberships.values()].find(
          (row) => row.id === id,
        )!;
        membership.role = { slug: roleSlug };
        return membership;
      },
      async deactivateOrganizationMembership(id: string) {
        const membership = [...memberships.values()].find(
          (row) => row.id === id,
        )!;
        membership.status = "inactive";
        return membership;
      },
      async getUser(id: string) {
        return {
          id,
          email: `${id}@example.com`,
          firstName: null,
          lastName: null,
        };
      },
      async listInvitations() {
        return { data: [], autoPagination: async () => [] };
      },
      deactivate(organizationId: string, userId: string) {
        memberships.get(`${organizationId}:${userId}`)!.status = "inactive";
      },
    },
  };
}
