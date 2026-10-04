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

vi.mock("@workos-inc/authkit-nextjs", () => ({ getWorkOS: vi.fn() }));

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
            content: "Initial context",
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
      expect(detail.changes[0].content).toBe("Initial context");
      expect(detail.versions[0].label).toBe("v1");
      expect(
        ((await (await list(organizationId)).json()) as DashboardData)
          .documents[0].status,
      ).toBe("Draft");
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
      ).rejects.toMatchObject({ status: 404 });
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
            content: "",
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
      requireUser.mockResolvedValueOnce({ ...user, id: "outsider" });
      await expect(list(organizationId)).rejects.toMatchObject({ status: 404 });
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
