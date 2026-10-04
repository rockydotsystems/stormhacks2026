import { fakeWorkOS } from "../../../../tests/workos";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import {
  githubInstallations,
  githubRepositoryAccess,
} from "@stormhacks/data/github/schema";
import { DocsService } from "@/features/docs/server/docs.service";
import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import { ProjectsService } from "@/features/projects/server/projects.service";
import type { OrganizationActor } from "@/features/organizations/contracts";
import type { Database } from "@/server/db";
import { ProjectCodebase } from "./project-codebase";

// Creates and drops only its own database; requires local CREATEDB privileges.
const workos = fakeWorkOS();
vi.mock("@workos-inc/authkit-nextjs", () => ({ getWorkOS: () => workos }));
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => workos,
}));

const remote = {
  installationToken: async () => "tok",
  defaultBranch: async () => "main",
  repositoryTree: async () => ({ truncated: false, tree: [] }),
  repositoryFile: async () => ({ type: "dir" }),
  searchCode: async () => [],
};

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "project codebase with real Postgres",
  () => {
    const databaseName = `codebase_test_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;
    let db: Database;
    let created = false;

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      client = postgres(url.toString(), { max: 5 });
      db = drizzle(client);
      await migrate(db, { migrationsFolder: "./drizzle" });
    });

    afterAll(async () => {
      try {
        if (client) await client.end();
        if (created) await admin.unsafe(`DROP DATABASE ${databaseName}`);
      } finally {
        if (admin) await admin.end();
      }
    });

    async function seed(orgName: string) {
      const organizations = new OrganizationsService({ db });
      const projects = new ProjectsService({ db });
      const docs = new DocsService({ db });
      const userId = `test-${randomUUID()}`;
      const org = await organizations.create(userId, orgName);
      const actor: OrganizationActor = { userId, organizationId: org.id };
      const project = await projects.create(actor, { name: "Platform" });
      const doc = await docs.create(actor, project.id, {
        title: "Plan",
        content: "Body",
      });
      const installationId = String(Math.floor(Math.random() * 1e9));
      await db.insert(githubInstallations).values({
        id: installationId,
        organizationId: org.id,
        accountLogin: "acme",
        connectedBy: userId,
        githubUserId: "1",
        githubUserLogin: "dev",
      });
      async function link(name: string, access = true) {
        const repository = await projects.connectRepository(actor, {
          owner: "acme",
          name,
        });
        await db.insert(githubRepositoryAccess).values({
          repositoryId: repository.id,
          organizationId: org.id,
          installationId,
          githubId: String(Math.floor(Math.random() * 1e9)),
          available: access,
        });
        return repository;
      }
      return { actor, org, project, doc, projects, link, installationId };
    }

    it("lists only the repositories linked to the document's project", async () => {
      const a = await seed("Org A");
      const linked = await a.link("api");
      await a.link("unlinked");
      await a.projects.linkRepository(a.actor, a.project.id, linked.id);

      const reader = await new ProjectCodebase({ db }, remote).forDocument(
        a.org.id,
        a.doc.id,
      );
      expect(reader?.repositories()).toEqual(["acme/api"]);
    });

    it("skips repositories the installation can no longer reach", async () => {
      const a = await seed("Org B");
      const gone = await a.link("gone", false);
      await a.projects.linkRepository(a.actor, a.project.id, gone.id);
      expect(
        await new ProjectCodebase({ db }, remote).forDocument(
          a.org.id,
          a.doc.id,
        ),
      ).toBeNull();

      await db
        .update(githubRepositoryAccess)
        .set({ available: true })
        .where(eq(githubRepositoryAccess.repositoryId, gone.id));
      const reader = await new ProjectCodebase({ db }, remote).forDocument(
        a.org.id,
        a.doc.id,
      );
      expect(reader?.repositories()).toEqual(["acme/gone"]);
    });

    it("returns null for a project with no repositories", async () => {
      const a = await seed("Org C");
      expect(
        await new ProjectCodebase({ db }, remote).forDocument(
          a.org.id,
          a.doc.id,
        ),
      ).toBeNull();
    });

    it("never reads another organization's document", async () => {
      const a = await seed("Org D");
      const b = await seed("Org E");
      const repo = await a.link("secret");
      await a.projects.linkRepository(a.actor, a.project.id, repo.id);
      expect(
        await new ProjectCodebase({ db }, remote).forDocument(
          b.org.id,
          a.doc.id,
        ),
      ).toBeNull();
    });
  },
);
