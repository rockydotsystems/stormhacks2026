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
import { SlackSettingsService } from "./slack-settings.service";
import { resolveBinding } from "./bindings";
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
    let actor: { userId: string; organizationId: string };
    let projectId: string;
    const reply = vi
      .spyOn(SlackClient.prototype, "reply")
      .mockResolvedValue(undefined);
    vi.spyOn(SlackClient.prototype, "botToken").mockResolvedValue("test-token");
    const channel = vi
      .spyOn(SlackClient.prototype, "channel")
      .mockResolvedValue({
        id: "C123",
        name: "demo",
        is_member: true,
      });
    vi.spyOn(SlackClient.prototype, "sharedConnection").mockResolvedValue({
      token: "test-token",
      ok: true,
      team_id: "T123",
      team: "Demo workspace",
      bot_id: "B123",
    });
    vi.spyOn(SlackClient.prototype, "authorize").mockResolvedValue(
      "https://api.workos.com/test-authorize",
    );
    const slackUser = vi
      .spyOn(SlackClient.prototype, "user")
      .mockResolvedValue({
        id: "U123",
        team_id: "T123",
        profile: { email: "user_slacktest@example.com" },
      });
    vi.spyOn(workos.userManagement, "getUser").mockImplementation(
      async (id) => ({
        id,
        email: `${id}@example.com`,
        firstName: null,
        lastName: null,
        emailVerified: true,
      }),
    );

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
      actor = { organizationId: org.id, userId: "user_slacktest" };
      await workos.userManagement.createOrganizationMembership({
        ...actor,
        roleSlug: "admin",
      });
      await db`insert into users (id) values (${actor.userId})`;
      await db`insert into organizations (id, name) values (${org.id}, 'Slack demo')`;
      const [project] =
        await db`insert into projects (organization_id, name) values (${org.id}, 'Database') returning id`;
      projectId = project.id;
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
    it("connects a workspace, verifies user identity, and routes without environment mappings", async () => {
      const settings = new SlackSettingsService({ db: drizzle(db) });
      expect(await settings.connect(actor)).toBe(
        "https://api.workos.com/test-authorize",
      );
      await settings.verify(actor);
      await settings.linkUser(actor, "U123");
      await settings.bind(actor, "C123", projectId);
      expect(
        (await resolveBinding(drizzle(db), "T123", "C123", "U123"))?.actor,
      ).toEqual(actor);
      await service.enqueue({ ...input, event_id: "EvStored" });
      await service.processNext();
      expect(reply).toHaveBeenCalledTimes(1);
      await settings.unbind(actor, "C123");
      expect(
        await resolveBinding(drizzle(db), "T123", "C123", "U123"),
      ).toBeNull();
    });
    it("rejects nonadmins, another organization claiming a workspace, and mismatched user identities", async () => {
      const settings = new SlackSettingsService({ db: drizzle(db) });
      const member = {
        organizationId: actor.organizationId,
        userId: "user_member",
      };
      await workos.userManagement.createOrganizationMembership(member);
      await expect(settings.connect(member)).rejects.toMatchObject({
        status: 403,
      });
      const org = await workos.organizations.createOrganization({
        name: "Other organization",
      });
      const outsider = { organizationId: org.id, userId: "user_other" };
      await db`insert into organizations (id, name) values (${org.id}, 'Other organization')`;
      await workos.userManagement.createOrganizationMembership({
        ...outsider,
        roleSlug: "admin",
      });
      await expect(settings.verify(outsider)).rejects.toMatchObject({
        status: 409,
      });
      slackUser.mockResolvedValueOnce({
        id: "U999",
        team_id: "T123",
        profile: { email: "someone-else@example.com" },
      });
      await expect(settings.linkUser(actor, "U999")).rejects.toMatchObject({
        status: 403,
      });
    });
    it("rejects shared channels and cancels pending jobs after disconnect", async () => {
      const settings = new SlackSettingsService({ db: drizzle(db) });
      channel.mockResolvedValueOnce({
        id: "C123",
        name: "shared",
        is_member: true,
        is_ext_shared: true,
      });
      await expect(
        settings.bind(actor, "C123", projectId),
      ).rejects.toMatchObject({ status: 400 });
      await settings.bind(actor, "C123", projectId);
      await service.enqueue({ ...input, event_id: "EvDisconnect" });
      await settings.disconnect(actor);
      await service.processNext();
      expect(
        (
          await db`select status from slack_jobs where event_id = 'EvDisconnect'`
        )[0].status,
      ).toBe("cancelled");
      expect(reply).not.toHaveBeenCalled();
    });
  },
);
