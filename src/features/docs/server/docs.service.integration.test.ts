import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { DocsService } from "@/features/docs/server/docs.service";
import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import { ProjectsService } from "@/features/projects/server/projects.service";
import type { OrganizationActor } from "@/features/organizations/contracts";

// Creates and drops only its own database; requires local CREATEDB privileges.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "docs data layer with real Postgres",
  () => {
    const databaseName = `docs_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let docs: DocsService;
    let organizations: OrganizationsService;
    let projects: ProjectsService;
    let created = false;

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
      docs = new DocsService({ db });
      organizations = new OrganizationsService({ db });
      projects = new ProjectsService({ db });
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
      const userId = `test-${randomUUID()}`;
      const org = await organizations.create(userId, "Test organization");
      const actor: OrganizationActor = { userId, organizationId: org.id };
      const project = await projects.create(actor, { name: "Test project" });
      const doc = await docs.create(actor, project.id, {
        title: "First title",
        content: "Full first snapshot",
      });
      return { actor, doc, project };
    }

    it("supports multiple projects and docs with membership and project-scoped access", async () => {
      const { actor, doc, project } = await fixture();
      const other = await fixture();
      const memberId = `test-${randomUUID()}`;
      await organizations.addMember(actor, memberId);
      await organizations.addMember(actor, memberId);
      const member = { ...actor, userId: memberId };
      const second = await docs.create(member, project.id, {
        title: "Another doc",
        content: "",
      });
      expect(
        (await docs.list(member, project.id)).map((row) => row.id),
      ).toEqual(expect.arrayContaining([doc.id, second.id]));
      expect(await organizations.list(memberId)).toHaveLength(1);
      await expect(
        docs.list({ ...actor, userId: other.actor.userId }, project.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(docs.listChanges(other.actor, doc.id)).rejects.toMatchObject(
        { status: 404 },
      );
      await expect(
        docs.addChange(other.actor, doc.id, { title: "Forged", content: "" }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        organizations.addMember(other.actor, memberId),
      ).resolves.toBeUndefined();
      expect(await organizations.list(memberId)).toHaveLength(2);
      const anotherProject = await projects.create(actor, {
        name: "Second project",
      });
      const third = await docs.create(actor, anotherProject.id, {
        title: "Third doc",
        content: "",
      });
      expect(await projects.list(actor)).toHaveLength(2);
      expect(await projects.get(member, project.id)).toEqual(project);
      expect(
        (await docs.list(actor, anotherProject.id)).map((row) => row.id),
      ).toEqual([third.id]);
      expect(
        (await docs.list(actor, project.id)).map((row) => row.id),
      ).not.toContain(third.id);
      await expect(projects.get(other.actor, project.id)).rejects.toMatchObject(
        { status: 404 },
      );
      await expect(
        projects.create(
          { ...actor, userId: `outsider-${randomUUID()}` },
          { name: "Forged" },
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        docs.create(actor, other.project.id, {
          title: "Cross-org",
          content: "",
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        docs.create(actor, randomUUID(), { title: "Missing", content: "" }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        client`INSERT INTO docs (organization_id, project_id) VALUES (${actor.organizationId}, ${other.project.id})`,
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        client`INSERT INTO docs (organization_id) VALUES (${actor.organizationId})`,
      ).rejects.toMatchObject({ code: "23502" });
      await expect(
        client`DELETE FROM projects WHERE id = ${project.id}`,
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        client`UPDATE docs SET project_id = ${anotherProject.id} WHERE id = ${doc.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`UPDATE projects SET organization_id = ${other.actor.organizationId} WHERE id = ${project.id}`,
      ).rejects.toThrow("immutable");
    });

    it("deletes arbitrary drafts, recomputes numbers and preserves independent full snapshots", async () => {
      const { actor, doc } = await fixture();
      const middle = await docs.addChange(actor, doc.id, {
        title: "Middle",
        content: "Middle snapshot",
      });
      const last = await docs.addChange(actor, doc.id, {
        title: "Last",
        content: "Independent last snapshot",
      });
      const initial = (await docs.listChanges(actor, doc.id))[0];
      await docs.deleteChange(actor, doc.id, middle.id);
      let history = await docs.listChanges(actor, doc.id);
      expect(history.map((row) => row.number)).toEqual([1, 2]);
      expect(history[1]).toMatchObject({
        id: last.id,
        content: "Independent last snapshot",
        immutable: false,
      });
      await docs.deleteChange(actor, doc.id, initial.id);
      await docs.deleteChange(actor, doc.id, last.id);
      expect(await docs.listChanges(actor, doc.id)).toEqual([]);
      await docs.addChange(actor, doc.id, {
        title: "Restart",
        content: "New full snapshot",
      });
      history = await docs.listChanges(actor, doc.id);
      expect(history[0].number).toBe(1);
      expect(() => JSON.stringify(history)).not.toThrow();
    });

    it("publishes selected snapshots, freezes all preceding history and advances v1/v2/v3", async () => {
      const { actor, doc } = await fixture();
      const initial = (await docs.listChanges(actor, doc.id))[0];
      const selected = await docs.addChange(actor, doc.id, {
        title: "Published title",
        content: "Published full body",
      });
      const draft = await docs.addChange(actor, doc.id, {
        title: "Later draft",
        content: "Not published",
      });
      expect(await docs.publish(actor, doc.id, selected.id)).toMatchObject({
        number: 1,
        label: "v1",
        changeId: selected.id,
      });
      expect(
        (await docs.listChanges(actor, doc.id)).map((row) => row.immutable),
      ).toEqual([true, true, false]);
      for (const id of [initial.id, selected.id]) {
        await expect(
          docs.deleteChange(actor, doc.id, id),
        ).rejects.toMatchObject({ status: 409 });
        await expect(docs.publish(actor, doc.id, id)).rejects.toMatchObject({
          status: 409,
        });
      }
      await docs.deleteChange(actor, doc.id, draft.id);
      const next = await docs.addChange(actor, doc.id, {
        title: "Second",
        content: "Second version",
      });
      await docs.publish(actor, doc.id, next.id);
      const third = await docs.addChange(actor, doc.id, {
        title: "Third",
        content: "Third version",
      });
      await docs.publish(actor, doc.id, third.id);
      expect(
        (await docs.listVersions(actor, doc.id)).map((row) => row.label),
      ).toEqual(["v1", "v2", "v3"]);
      expect(await docs.getVersion(actor, doc.id, 1)).toMatchObject({
        title: "Published title",
        content: "Published full body",
      });
    });

    it("guards snapshots and versions against direct SQL mutation and unpublishing", async () => {
      const { actor, doc } = await fixture();
      const first = (await docs.listChanges(actor, doc.id))[0];
      const last = await docs.addChange(actor, doc.id, {
        title: "Release",
        content: "Release body",
      });
      const version = await docs.publish(actor, doc.id, last.id);
      await expect(
        client`UPDATE doc_changes SET content = 'tampered' WHERE id = ${last.id}`,
      ).rejects.toThrow("append-only");
      await expect(
        client`DELETE FROM doc_changes WHERE id = ${first.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`DELETE FROM doc_changes WHERE id = ${last.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`UPDATE doc_versions SET number = 50 WHERE id = ${version.id}`,
      ).rejects.toThrow("unpublished");
      await expect(
        client`DELETE FROM doc_versions WHERE id = ${version.id}`,
      ).rejects.toThrow("unpublished");
      await expect(
        client`UPDATE docs SET organization_id = ${randomUUID()} WHERE id = ${doc.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`INSERT INTO doc_changes (id, doc_id, title, content, created_by) OVERRIDING SYSTEM VALUE VALUES (${(BigInt(first.id) - BigInt(1)).toString()}, ${doc.id}, 'Backfill', '', ${actor.userId})`,
      ).rejects.toThrow("immutable");
      const draft = await docs.addChange(actor, doc.id, {
        title: "Draft",
        content: "",
      });
      await expect(
        client`UPDATE doc_changes SET title = 'edited' WHERE id = ${draft.id}`,
      ).rejects.toThrow("append-only");
      await client`DELETE FROM doc_changes WHERE id = ${draft.id}`;
    });

    it("enforces sequential direct SQL publication and same-doc references", async () => {
      const { actor, doc } = await fixture();
      const other = await fixture();
      const first = (await docs.listChanges(actor, doc.id))[0];
      await expect(
        client`INSERT INTO doc_versions (doc_id, change_id, number, published_by) VALUES (${doc.id}, ${first.id}, 5, ${actor.userId})`,
      ).rejects.toThrow("sequential");
      await expect(
        client`INSERT INTO doc_versions (doc_id, change_id, published_by) VALUES (${other.doc.id}, ${first.id}, ${other.actor.userId})`,
      ).rejects.toMatchObject({ code: "23503" });
      const [version] =
        await client`INSERT INTO doc_versions (doc_id, change_id, published_by) VALUES (${doc.id}, ${first.id}, ${actor.userId}) RETURNING number`;
      expect(version.number).toBe(1);
      await expect(
        client`INSERT INTO doc_versions (doc_id, change_id, published_by) VALUES (${doc.id}, ${first.id}, ${actor.userId})`,
      ).rejects.toThrow("latest version");
    });

    it("links many repositories to projects without cross-org references or duplicates", async () => {
      const { actor, doc, project } = await fixture();
      const other = await fixture();
      const second = await projects.create(actor, { name: "Second project" });
      const anotherDoc = await docs.create(actor, project.id, {
        title: "Second doc",
        content: "",
      });
      const repo = await projects.connectRepository(actor, {
        owner: "ORG",
        name: "Repository",
      });
      expect(
        await projects.connectRepository(actor, {
          owner: "org",
          name: "repository",
        }),
      ).toEqual(repo);
      const another = await projects.connectRepository(actor, {
        owner: "org",
        name: "another",
      });
      const foreign = await projects.connectRepository(other.actor, {
        owner: "org",
        name: "repository",
      });
      for (const projectId of [project.id, second.id]) {
        await projects.linkRepository(actor, projectId, repo.id);
        await projects.linkRepository(actor, projectId, another.id);
        await projects.linkRepository(actor, projectId, repo.id);
        expect(
          await projects.listProjectRepositories(actor, projectId),
        ).toHaveLength(2);
      }
      expect(await projects.listRepositories(actor)).toHaveLength(2);
      expect((await docs.list(actor, project.id)).map((row) => row.id)).toEqual(
        expect.arrayContaining([doc.id, anotherDoc.id]),
      );
      await expect(
        projects.linkRepository(actor, project.id, foreign.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        client`INSERT INTO project_repositories (organization_id, project_id, repository_id) VALUES (${actor.organizationId}, ${project.id}, ${foreign.id})`,
      ).rejects.toMatchObject({ code: "23503" });
      await projects.unlinkRepository(actor, project.id, repo.id);
      expect(
        await projects.listProjectRepositories(actor, project.id),
      ).toHaveLength(1);
      expect(
        await projects.listProjectRepositories(actor, second.id),
      ).toHaveLength(2);
      await expect(
        projects.listProjectRepositories(other.actor, project.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        projects.unlinkRepository(other.actor, project.id, repo.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("handles missing changes and rejects another doc's snapshot", async () => {
      const { actor, doc, project } = await fixture();
      const second = await docs.create(actor, project.id, {
        title: "Second",
        content: "",
      });
      const first = (await docs.listChanges(actor, doc.id))[0];
      await expect(
        docs.publish(actor, second.id, first.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        docs.deleteChange(actor, second.id, first.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(docs.getVersion(actor, doc.id, 1)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        docs.publish(actor, doc.id, "9223372036854775807"),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("serializes concurrent publication without duplicate versions", async () => {
      const { actor, doc } = await fixture();
      const first = (await docs.listChanges(actor, doc.id))[0];
      const results = await Promise.allSettled([
        docs.publish(actor, doc.id, first.id),
        docs.publish(actor, doc.id, first.id),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(await docs.listVersions(actor, doc.id)).toHaveLength(1);
      const next = await docs.addChange(actor, doc.id, {
        title: "Next",
        content: "",
      });
      const direct = await Promise.allSettled([
        client`INSERT INTO doc_versions (doc_id, change_id, published_by) VALUES (${doc.id}, ${next.id}, ${actor.userId})`,
        client`INSERT INTO doc_versions (doc_id, change_id, published_by) VALUES (${doc.id}, ${next.id}, ${actor.userId})`,
      ]);
      expect(
        direct.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        (await docs.listVersions(actor, doc.id)).map((row) => row.number),
      ).toEqual([1, 2]);
    });

    it("keeps publish/delete races consistent", async () => {
      const { actor, doc } = await fixture();
      const first = (await docs.listChanges(actor, doc.id))[0];
      const results = await Promise.allSettled([
        docs.publish(actor, doc.id, first.id),
        docs.deleteChange(actor, doc.id, first.id),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const versions = await docs.listVersions(actor, doc.id);
      const history = await docs.listChanges(actor, doc.id);
      if (versions.length) {
        expect(history).toHaveLength(1);
        expect(history[0].immutable).toBe(true);
      } else {
        expect(history).toHaveLength(0);
      }
    });
  },
);
