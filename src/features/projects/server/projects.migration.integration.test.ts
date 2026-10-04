import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { DocsService } from "@/features/docs/server/docs.service";
import { ProjectsService } from "@/features/projects/server/projects.service";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "project hierarchy upgrade with real Postgres",
  () => {
    const databaseName = `projects_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let migrationFolder: string;
    let created = false;

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      migrationFolder = await mkdtemp(
        join(tmpdir(), "stormhacks-project-upgrade-"),
      );
      await mkdir(join(migrationFolder, "meta"));
      const journal = JSON.parse(
        await readFile("drizzle/meta/_journal.json", "utf8"),
      );
      journal.entries = journal.entries.filter(
        (entry: { idx: number }) => entry.idx <= 1,
      );
      await writeFile(
        join(migrationFolder, "meta/_journal.json"),
        JSON.stringify(journal),
      );
      for (const entry of journal.entries) {
        await cp(
          `drizzle/${entry.tag}.sql`,
          join(migrationFolder, `${entry.tag}.sql`),
        );
      }
      await migrate(drizzle(client), { migrationsFolder: migrationFolder });
    });

    afterAll(async () => {
      try {
        if (client) await client.end();
        if (created) await admin.unsafe(`DROP DATABASE ${databaseName}`);
        if (migrationFolder) await rm(migrationFolder, { recursive: true });
      } finally {
        if (admin) await admin.end();
      }
    });

    it("backfills projects and repository sets without changing snapshots or published versions", async () => {
      const userId = `test-${randomUUID()}`;
      await client`INSERT INTO users (id) VALUES (${userId})`;
      const [org] =
        await client`INSERT INTO organizations (name) VALUES ('Legacy org') RETURNING id`;
      const [otherOrg] =
        await client`INSERT INTO organizations (name) VALUES ('Other org') RETURNING id`;
      await client`INSERT INTO organization_members (organization_id, user_id) VALUES (${org.id}, ${userId}), (${otherOrg.id}, ${userId})`;
      const [doc] =
        await client`INSERT INTO docs (organization_id) VALUES (${org.id}) RETURNING *`;
      const [second] =
        await client`INSERT INTO docs (organization_id) VALUES (${org.id}) RETURNING *`;
      const [empty] =
        await client`INSERT INTO docs (organization_id) VALUES (${org.id}) RETURNING *`;
      const [foreignDoc] =
        await client`INSERT INTO docs (organization_id) VALUES (${otherOrg.id}) RETURNING *`;
      const [first] =
        await client`INSERT INTO doc_changes (doc_id, title, content, created_by) VALUES (${doc.id}, 'Published title', 'Frozen full body', ${userId}) RETURNING id`;
      const [version] =
        await client`INSERT INTO doc_versions (doc_id, change_id, published_by) VALUES (${doc.id}, ${first.id}, ${userId}) RETURNING *`;
      await client`INSERT INTO doc_changes (doc_id, title, content, created_by) VALUES (${doc.id}, 'Latest draft title', 'Latest full body', ${userId}), (${second.id}, 'Other doc', 'Independent body', ${userId})`;
      const [repo] =
        await client`INSERT INTO github_repositories (organization_id, owner, name) VALUES (${org.id}, 'org', 'shared') RETURNING id`;
      const [another] =
        await client`INSERT INTO github_repositories (organization_id, owner, name) VALUES (${org.id}, 'org', 'exclusive') RETURNING id`;
      await client`INSERT INTO doc_repositories (organization_id, doc_id, repository_id) VALUES (${org.id}, ${doc.id}, ${repo.id}), (${org.id}, ${doc.id}, ${another.id}), (${org.id}, ${second.id}, ${repo.id})`;
      const beforeChanges = await client`SELECT * FROM doc_changes ORDER BY id`;
      const beforeVersions =
        await client`SELECT * FROM doc_versions ORDER BY id`;

      const db = drizzle(client);
      // Simulate an installation that already applied the dashboard's migration.
      const dashboardJournal = JSON.parse(
        await readFile("drizzle/meta/_journal.json", "utf8"),
      );
      dashboardJournal.entries = dashboardJournal.entries.filter(
        (entry: { idx: number }) => entry.idx <= 3,
      );
      await writeFile(
        join(migrationFolder, "meta/_journal.json"),
        JSON.stringify(dashboardJournal),
      );
      for (const entry of dashboardJournal.entries) {
        await cp(
          `drizzle/${entry.tag}.sql`,
          join(migrationFolder, `${entry.tag}.sql`),
        );
      }
      await migrate(db, { migrationsFolder: migrationFolder });
      await client`UPDATE projects SET description = 'Existing dashboard description' WHERE id = ${doc.id}`;
      await migrate(db, { migrationsFolder: "./drizzle" });
      await migrate(db, { migrationsFolder: "./drizzle" });
      expect(await client`SELECT * FROM doc_changes ORDER BY id`).toEqual(
        beforeChanges.map((row) => ({ ...row, proposed: false })),
      );
      expect(await client`SELECT * FROM doc_versions ORDER BY id`).toEqual(
        beforeVersions,
      );
      expect(
        (
          await client`SELECT to_regclass('public.doc_repositories') AS table_name`
        )[0].table_name,
      ).toBeNull();

      const projects = new ProjectsService({ db });
      const docs = new DocsService({ db });
      const actor = { organizationId: org.id as string, userId };
      expect(await projects.list(actor)).toHaveLength(3);
      expect(
        await projects.list({ organizationId: otherOrg.id as string, userId }),
      ).toHaveLength(1);
      expect(await projects.get(actor, doc.id)).toMatchObject({
        id: doc.id,
        name: "Latest draft title",
        description: "Existing dashboard description",
        createdAt: new Date(doc.created_at).toISOString(),
      });
      expect(await projects.get(actor, empty.id)).toMatchObject({
        name: `Imported doc ${empty.id}`,
      });
      expect((await docs.list(actor, doc.id))[0]).toMatchObject({
        id: doc.id,
        projectId: doc.id,
      });
      expect(
        (await projects.listProjectRepositories(actor, doc.id))
          .map((row) => row.id)
          .sort(),
      ).toEqual([repo.id, another.id].sort());
      expect(
        (await projects.listProjectRepositories(actor, second.id)).map(
          (row) => row.id,
        ),
      ).toEqual([repo.id]);
      expect(await projects.listProjectRepositories(actor, empty.id)).toEqual(
        [],
      );
      expect(await docs.getVersion(actor, doc.id, 1)).toMatchObject({
        id: version.id,
        title: "Published title",
        content: "Frozen full body",
        label: "v1",
      });
      await expect(
        client`DELETE FROM doc_changes WHERE id = ${first.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`DELETE FROM doc_versions WHERE id = ${version.id}`,
      ).rejects.toThrow("unpublished");
      await expect(
        client`UPDATE docs SET project_id = ${second.id} WHERE id = ${doc.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`UPDATE projects SET organization_id = ${otherOrg.id} WHERE id = ${doc.id}`,
      ).rejects.toThrow("immutable");
      await expect(
        client`INSERT INTO docs (organization_id, project_id) VALUES (${org.id}, ${foreignDoc.id})`,
      ).rejects.toMatchObject({ code: "23503" });
      const history = await docs.listChanges(actor, doc.id);
      expect(history.map((row) => row.immutable)).toEqual([true, false]);
      await docs.deleteChange(actor, doc.id, history[1].id);
      const next = await docs.addChange(actor, doc.id, {
        title: "After migration",
        content: "New complete body",
      });
      expect(await docs.publish(actor, doc.id, next.id)).toMatchObject({
        label: "v2",
      });
      const sibling = await docs.create(actor, doc.id, {
        title: "Sibling doc",
        content: "Same project",
      });
      expect((await docs.list(actor, doc.id)).map((row) => row.id)).toEqual(
        expect.arrayContaining([doc.id, sibling.id]),
      );
    });
  },
);
