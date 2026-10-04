import { fakeWorkOS } from "../../../../tests/workos";
import type { DashboardData, DocumentData } from "../contracts";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DashboardController } from "./dashboard.controller";
import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import { ProjectsService } from "@/features/projects/server/projects.service";
import { DocsService } from "@/features/docs/server/docs.service";

const workos = fakeWorkOS();
vi.mock("@workos-inc/authkit-nextjs", () => ({ getWorkOS: () => workos }));
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => workos,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "dashboard with Postgres",
  () => {
    const databaseName = `dashboard_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let controller: DashboardController;
    const user = {
      id: `test-${randomUUID()}`,
      email: "test@example.com",
      firstName: "Test",
      lastName: "Member",
      profilePictureUrl: null,
    };
    const requireUser = vi.fn().mockResolvedValue(user);
    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
      controller = new DashboardController({
        db,
        authService: { requireUser, getSession: vi.fn() },
        organizationsService: new OrganizationsService({ db }),
        projectsService: new ProjectsService({ db }),
        docsService: new DocsService({ db }),
      });
    });
    afterAll(async () => {
      try {
        if (client) await client.end();
        if (admin)
          await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName}`);
      } finally {
        if (admin) await admin.end();
      }
    });
    function request(body: unknown) {
      return new Request("http://localhost/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    const list = (organizationId?: string) =>
      controller.list(
        new Request(
          `http://localhost/api/dashboard${organizationId ? `?organizationId=${organizationId}` : ""}`,
        ),
      );

    it("persists projects, repository links, snapshots and immutable bound versions", async () => {
      expect(
        ((await (await list()).json()) as DashboardData).organizations,
      ).toEqual([]);
      const org = (await (
        await controller.create(
          request({ action: "createOrganization", name: "Our team" }),
        )
      ).json()) as { id: string };
      const organizationId = org.id;
      const repo = (await (
        await controller.create(
          request({
            action: "connectRepository",
            organizationId,
            owner: "Org",
            name: "Frontend",
          }),
        )
      ).json()) as { id: string };
      await client`INSERT INTO github_installations (id, organization_id, account_login, connected_by, github_user_id, github_user_login) VALUES ('dashboard-connected', ${organizationId}, 'org', ${user.id}, '123', 'test')`;
      await client`INSERT INTO github_repository_access (repository_id, organization_id, installation_id, github_id) VALUES (${repo.id}, ${organizationId}, 'dashboard-connected', '456')`;
      const project = (await (
        await controller.create(
          request({
            action: "createProject",
            organizationId,
            name: "Frontend",
            description: "Web and UI",
            repositoryIds: [repo.id, repo.id],
          }),
        )
      ).json()) as { id: string };
      const doc = (await (
        await controller.create(
          request({
            action: "createDocument",
            organizationId,
            projectId: project.id,
            title: "Use Postgres",
            description: "Initial context",
            userId: "forged-owner",
          }),
        )
      ).json()) as { id: string };
      let data = (await (await list(organizationId)).json()) as DashboardData;
      expect(data.projects[0]).toMatchObject({
        id: project.id,
        description: "Web and UI",
        repositories: ["org/frontend"],
      });
      expect(data.documents[0]).toMatchObject({
        id: doc.id,
        project: project.id,
        title: "Use Postgres",
        creator: user.id,
        status: "Draft",
        description: "Initial context",
      });
      expect(data.people[user.id].name).toBe("Test Member");
      const read = () =>
        controller.document(
          new Request(
            `http://localhost/api/documents/${doc.id}?organizationId=${organizationId}`,
          ),
          doc.id,
        );
      let detail = (await (await read()).json()) as DocumentData;
      expect(detail.changes[0].content).toBe("");
      await controller.updateDocument(
        request({
          action: "publish",
          organizationId,
          changeId: detail.changes[0].id,
        }),
        doc.id,
      );
      data = (await (await list(organizationId)).json()) as DashboardData;
      expect(data.documents[0].status).toBe("Bound");
      await controller.updateDocument(
        request({
          action: "save",
          organizationId,
          title: "Use Postgres v2",
          content: "New rationale",
        }),
        doc.id,
      );
      detail = (await (await read()).json()) as DocumentData;
      expect(
        detail.changes.map((row: { immutable: boolean }) => row.immutable),
      ).toEqual([true, false]);
      expect(detail.changes[0].content).toBe("");
      expect(detail.versions[0].label).toBe("v1");
      data = (await (await list(organizationId)).json()) as DashboardData;
      expect(data.documents[0].status).toBe("Draft");
      // The description stays the card preview after a draft exists.
      expect(data.documents[0].description).toBe("Initial context");
      await expect(
        controller.updateDocument(
          request({
            action: "publish",
            organizationId,
            changeId: detail.changes[0].id,
          }),
          doc.id,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const before = data.projects.length;
      await expect(
        controller.create(
          request({
            action: "createProject",
            organizationId,
            name: "Must roll back",
            repositoryIds: [randomUUID()],
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        ((await (await list(organizationId)).json()) as DashboardData).projects,
      ).toHaveLength(before);
      const other = (await (
        await controller.create(
          request({ action: "createOrganization", name: "Separate team" }),
        )
      ).json()) as { id: string };
      expect(
        ((await (await list(other.id)).json()) as DashboardData).documents,
      ).toEqual([]);
      await expect(
        controller.document(
          new Request(
            `http://localhost/api/documents/${doc.id}?organizationId=${other.id}`,
          ),
          doc.id,
        ),
      ).rejects.toMatchObject({ status: 404 });
      const emptyDoc = (await (
        await controller.create(
          request({
            action: "createDocument",
            organizationId,
            projectId: project.id,
            title: "Temporary draft",
          }),
        )
      ).json()) as { id: string };
      await client`DELETE FROM doc_changes WHERE doc_id = ${emptyDoc.id}`;
      const withEmpty = (await (
        await list(organizationId)
      ).json()) as DashboardData;
      expect(
        withEmpty.documents.find((item) => item.id === emptyDoc.id),
      ).toMatchObject({
        title: "Untitled document",
        status: "Draft",
        creator: "unknown",
      });
      // A stale local membership must not grant access after WorkOS revokes it.
      await client`INSERT INTO organization_members (organization_id, user_id) VALUES (${organizationId}, ${user.id})`;
      workos.userManagement.deactivate(organizationId, user.id);
      await expect(list(organizationId)).rejects.toMatchObject({ status: 404 });
      await expect(
        controller.updateDocument(
          request({
            action: "save",
            organizationId,
            title: "Revoked",
            content: "",
          }),
          doc.id,
        ),
      ).rejects.toMatchObject({ status: 404 });
      requireUser.mockResolvedValueOnce({ ...user, id: "outsider" });
      await expect(list(organizationId)).rejects.toMatchObject({ status: 404 });
    });
    it("offers only connected repositories and rejects disconnected project selections", async () => {
      const org = (await (
        await controller.create(
          request({ action: "createOrganization", name: "Connected repos" }),
        )
      ).json()) as { id: string };
      const organizationId = org.id;
      const ids: Record<string, string> = {};
      for (const name of ["connected", "manual", "removed", "unauthorized"]) {
        const repo = (await (
          await controller.create(
            request({
              action: "connectRepository",
              organizationId,
              owner: "org",
              name,
            }),
          )
        ).json()) as { id: string };
        ids[name] = repo.id;
      }
      await client`INSERT INTO github_installations (id, organization_id, account_login, connected_by, github_user_id, github_user_login) VALUES ('dashboard-filter', ${organizationId}, 'org', ${user.id}, '123', 'test')`;
      for (const name of ["connected", "removed", "unauthorized"]) {
        await client`INSERT INTO github_repository_access (repository_id, organization_id, installation_id, github_id, available, authorized) VALUES (${ids[name]}, ${organizationId}, 'dashboard-filter', ${name}, ${name !== "removed"}, ${name !== "unauthorized"})`;
      }
      const data = (await (await list(organizationId)).json()) as DashboardData;
      expect(data.repositories).toEqual([
        { id: ids.connected, owner: "org", name: "connected" },
      ]);
      for (const name of ["manual", "removed", "unauthorized"]) {
        await expect(
          controller.create(
            request({
              action: "createProject",
              organizationId,
              name: "Must not create",
              repositoryIds: [ids.connected, ids[name]],
            }),
          ),
        ).rejects.toMatchObject({ status: 400 });
      }
      await client`UPDATE github_installations SET active = false WHERE id = 'dashboard-filter'`;
      expect(
        ((await (await list(organizationId)).json()) as DashboardData)
          .repositories,
      ).toEqual([]);
      await expect(
        controller.create(
          request({
            action: "createProject",
            organizationId,
            name: "Suspended installation",
            repositoryIds: [ids.connected],
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        ((await (await list(organizationId)).json()) as DashboardData).projects,
      ).toEqual([]);
    });
    it("rejects invalid input before database writes", async () => {
      await expect(
        controller.create(request({ action: "createOrganization", name: " " })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        controller.create(
          new Request("http://localhost/api/dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        controller.create(
          new Request("http://localhost/api/dashboard", {
            method: "POST",
            body: "x",
          }),
        ),
      ).rejects.toMatchObject({ status: 415 });
    });
  },
);
