import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../db";
import { requireOrganizationMember } from "./membership";
import { organizationMembers, users } from "./schema";

const { memberships } = vi.hoisted(() => ({ memberships: vi.fn() }));
vi.mock("./workos", () => ({
  getWorkOS: () => ({
    userManagement: { listOrganizationMemberships: memberships },
  }),
}));

const actor = { organizationId: "org_example", userId: "user_example" };

describe("organization membership mirror", () => {
  beforeEach(() => vi.resetAllMocks());

  function database() {
    const writes: Array<{ table: unknown; value: unknown }> = [];
    const insert = vi.fn((table: unknown) => ({
      values: (value: unknown) => ({
        onConflictDoNothing: async () => {
          writes.push({ table, value });
        },
      }),
    }));
    return { db: { insert } as unknown as Database, writes, insert };
  }

  it("mirrors verified membership before conversation foreign keys use it", async () => {
    memberships.mockResolvedValue({
      data: [{ ...actor, status: "active" }],
    });
    const { db, writes } = database();

    await requireOrganizationMember(db, actor);

    expect(writes).toEqual([
      { table: users, value: { id: actor.userId } },
      { table: organizationMembers, value: actor },
    ]);
    expect(memberships).toHaveBeenCalledWith({
      ...actor,
      statuses: ["active"],
      limit: 1,
    });
  });

  it.each([
    { data: [] },
    { data: [{ ...actor, status: "inactive" }] },
    { data: [{ ...actor, organizationId: "org_other", status: "active" }] },
    { data: [{ ...actor, userId: "user_other", status: "active" }] },
  ])("does not mirror an unverified membership: $data", async ({ data }) => {
    memberships.mockResolvedValue({ data });
    const { db, insert } = database();

    await expect(requireOrganizationMember(db, actor)).rejects.toMatchObject({
      status: 404,
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
