import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fakeWorkOS } from "../../../../tests/workos";
import { OrganizationsService } from "./organizations.service";
import { TeamService } from "./team.service";
import { ProjectsService } from "../projects/projects.service";
import { DocsService } from "../docs/docs.service";
import type { Database } from "../db";

const workos = fakeWorkOS();
vi.mock("./workos", () => ({ getWorkOS: () => workos }));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "team safety with real Postgres",
  () => {
    const databaseName = `team_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let db: Database;
    let team: TeamService;
    let organizations: OrganizationsService;
    let created = false;

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      db = drizzle(client);
      await migrate(db, { migrationsFolder: "drizzle" });
      team = new TeamService({ db });
      organizations = new OrganizationsService({ db });
    });

    afterAll(async () => {
      try {
        if (client) await client.end();
        if (created) await admin.unsafe(`DROP DATABASE ${databaseName}`);
      } finally {
        if (admin) await admin.end();
      }
    });

    async function fixture() {
      const userId = `creator-${randomUUID()}`;
      const org = await organizations.create(userId, "Team");
      const actor = { organizationId: org.id, userId };
      const member = await workos.userManagement.createOrganizationMembership({
        organizationId: org.id,
        userId: `manager-${randomUUID()}`,
      });
      return { actor, member };
    }

    it.each(["role", "remove"] as const)(
      "keeps one admin under concurrent self-%s requests on independent connections",
      async (action) => {
        const { actor, member } = await fixture();
        await team.act(actor, {
          action: "role",
          membershipId: member.id,
          role: "admin",
        });
        const first = (
          await workos.userManagement.listOrganizationMemberships({
            ...actor,
            statuses: ["active"],
          })
        ).data[0];
        const attempts = [first, member].map((membership) =>
          team.act(
            { organizationId: actor.organizationId, userId: membership.userId },
            action === "role"
              ? { action, membershipId: membership.id, role: "member" }
              : { action, membershipId: membership.id },
          ),
        );
        const results = await Promise.allSettled(attempts);
        expect(
          results.filter((row) => row.status === "fulfilled"),
        ).toHaveLength(1);
        expect(results.filter((row) => row.status === "rejected")).toHaveLength(
          1,
        );
        const active = (
          await workos.userManagement.listOrganizationMemberships({
            organizationId: actor.organizationId,
            statuses: ["active"],
          })
        ).data;
        expect(active.filter((row) => row.role.slug === "admin")).toHaveLength(
          1,
        );
      },
    );

    it("lets a non-GitHub member create, edit, and bind docs; kicking removes access but retains contributions", async () => {
      const { actor, member } = await fixture();
      const projects = new ProjectsService({ db });
      const docs = new DocsService({ db });
      const project = await projects.create(actor, { name: "Decisions" });
      const manager = { ...actor, userId: member.userId };
      const doc = await docs.create(manager, project.id, {
        title: "Manager decision",
        content: "Context",
      });
      const change = await docs.addChange(manager, doc.id, {
        title: "Manager decision",
        content: "Reviewed context",
      });
      await docs.publish(manager, doc.id, String(change.id));
      expect(await docs.listChanges(actor, doc.id)).toHaveLength(2);
      expect(await docs.listVersions(actor, doc.id)).toHaveLength(1);
      await team.act(actor, { action: "remove", membershipId: member.id });
      await expect(docs.listChanges(manager, doc.id)).rejects.toMatchObject({
        status: 404,
      });
      expect(await docs.listChanges(actor, doc.id)).toHaveLength(2);
    });
  },
);
