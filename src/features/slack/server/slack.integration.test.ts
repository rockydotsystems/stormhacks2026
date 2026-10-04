import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fakeWorkOS } from "../../../../tests/workos";
import { FakeModel } from "@/features/planning/server/fake.model";
import type { ModelRequest } from "@/features/planning/server/model";
import { SlackService } from "./slack.service";
import { SlackClient } from "./slack.client";
import type { SlackMention } from "./events";

const workos = fakeWorkOS();
vi.mock("@stormhacks/data/organizations/workos", () => ({
  getWorkOS: () => workos,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Slack mention to grounded reply with Postgres",
  () => {
    const name = `slack_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    let service: SlackService;
    let input: SlackMention;
    const reply = vi
      .spyOn(SlackClient.prototype, "reply")
      .mockResolvedValue(undefined);
    vi.spyOn(SlackClient.prototype, "botToken").mockResolvedValue("test-token");

    beforeAll(async () => {
      admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`create database ${name}`);
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${name}`;
      db = postgres(url.toString(), { max: 5 });
      await migrate(drizzle(db), { migrationsFolder: "./drizzle" });
      const org = await workos.organizations.createOrganization({
        name: "Slack demo",
      });
      const actor = { organizationId: org.id, userId: "user_slacktest" };
      await workos.userManagement.createOrganizationMembership(actor);
      await db`insert into users (id) values (${actor.userId})`;
      await db`insert into organizations (id, name) values (${org.id}, 'Slack demo')`;
      const [project] =
        await db`insert into projects (organization_id, name) values (${org.id}, 'Database') returning id`;
      const [doc] =
        await db`insert into docs (organization_id, project_id) values (${org.id}, ${project.id}) returning id`;
      await db`insert into doc_changes (doc_id, title, content, created_by) values (${doc.id}, 'Database choice', 'MSSQL was chosen because existing reporting depends on SQL Server.', ${actor.userId})`;
      vi.stubEnv(
        "SLACK_BINDINGS",
        JSON.stringify([
          {
            teamId: "T123",
            channelId: "C123",
            organizationId: org.id,
            projectId: project.id,
            users: { U123: actor.userId },
          },
        ]),
      );
      const model = new FakeModel({
        object: (request: ModelRequest) =>
          request.system?.startsWith("Extract up to eight")
            ? { terms: ["MSSQL", "SQL Server"] }
            : {
                answer: "MSSQL was chosen for existing reporting [1].",
                sourceIds: ["1"],
              },
      });
      service = new SlackService({ db: drizzle(db), model });
      input = {
        type: "event_callback",
        event_id: "Ev123",
        team_id: "T123",
        api_app_id: "A123",
        event: {
          type: "app_mention",
          user: "U123",
          channel: "C123",
          text: "<@U999>, why are we using an mssql database?",
          ts: "123.456",
        },
      };
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await db?.end();
      if (admin) {
        await admin.unsafe(`drop database ${name}`);
        await admin.end();
      }
    });
    it("persists one job for retries and produces one cited threaded answer", async () => {
      await Promise.all([service.enqueue(input), service.enqueue(input)]);
      expect((await db`select * from slack_jobs`).length).toBe(1);
      await Promise.all([service.processNext(), service.processNext()]);
      expect(reply).toHaveBeenCalledTimes(1);
      expect(reply.mock.calls[0].slice(1, 4)).toEqual([
        "C123",
        "123.456",
        "MSSQL was chosen for existing reporting [1].",
      ]);
      expect(reply.mock.calls[0][4][0].title).toBe("Database choice");
      expect((await db`select status from slack_jobs`)[0].status).toBe("sent");
      await service.enqueue(input);
      await service.processNext();
      expect(reply).toHaveBeenCalledTimes(1);
    });
    it("ignores unmapped users and cancels queued jobs when bindings are revoked", async () => {
      await service.enqueue({
        ...input,
        event_id: "Ev999",
        event: { ...input.event, user: "U999" },
      });
      expect(
        (await db`select * from slack_jobs where event_id = 'Ev999'`).length,
      ).toBe(0);
      await service.enqueue({ ...input, event_id: "Ev456" });
      vi.stubEnv("SLACK_BINDINGS", "[]");
      await service.processNext();
      expect(
        (await db`select status from slack_jobs where event_id = 'Ev456'`)[0]
          .status,
      ).toBe("cancelled");
      expect(reply).not.toHaveBeenCalled();
    });
  },
);
