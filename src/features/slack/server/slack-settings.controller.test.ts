import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { SlackSettingsController } from "./slack-settings.controller";

const service = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue("https://api.workos.com/authorize"),
  verify: vi.fn(),
  linkUser: vi.fn(),
  bind: vi.fn(),
  unbind: vi.fn(),
  disconnect: vi.fn(),
  status: vi.fn().mockResolvedValue({ workspace: null, canManage: true }),
}));
vi.mock("./slack-settings.service", () => ({
  SlackSettingsService: class {
    connect = service.connect;
    verify = service.verify;
    linkUser = service.linkUser;
    bind = service.bind;
    unbind = service.unbind;
    disconnect = service.disconnect;
    status = service.status;
  },
}));
const client = postgres("postgres://unused:unused@localhost/unused");
const requireUser = vi.fn().mockResolvedValue({
  id: "user_123",
  email: "demo@example.com",
  firstName: null,
  lastName: null,
  profilePictureUrl: null,
});
const controller = new SlackSettingsController({
  db: drizzle(client),
  authService: { requireUser },
  projectsService: { list: vi.fn().mockResolvedValue([]) },
});
afterAll(() => client.end());
afterEach(() => vi.unstubAllEnvs());

function post(body: unknown, origin = "https://whydidwechoosethis.tech") {
  return new Request("https://whydidwechoosethis.tech/api/slack/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

describe("Slack onboarding HTTP boundary", () => {
  it("uses the authenticated actor for the organization-owned authorization redirect", async () => {
    const response = await controller.connect(
      new Request("https://whydidwechoosethis.tech/api/slack/connect", {
        method: "POST",
        headers: {
          Origin: "https://whydidwechoosethis.tech",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "organizationId=org_123&userId=user_attacker",
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://api.workos.com/authorize",
    );
    expect(service.connect).toHaveBeenCalledWith({
      userId: "user_123",
      organizationId: "org_123",
    });
  });
  it("rejects cross-site changes and invalid JSON", async () => {
    await expect(
      controller.act(
        post(
          { organizationId: "org_123", action: "verify" },
          "https://attacker.invalid",
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const request = new Request(
      "https://whydidwechoosethis.tech/api/slack/settings",
      {
        method: "POST",
        headers: {
          Origin: "https://whydidwechoosethis.tech",
          "Content-Type": "application/json",
        },
        body: "{",
      },
    );
    await expect(controller.act(request)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("requires explicit channel-wide sharing consent", async () => {
    const body = {
      organizationId: "org_123",
      action: "bind",
      channelId: "C123",
      projectId: "00000000-0000-4000-8000-000000000001",
    };
    await expect(controller.act(post(body))).rejects.toMatchObject({
      status: 400,
    });
    expect(service.bind).not.toHaveBeenCalled();
    expect(
      (await controller.act(post({ ...body, confirmSharing: true }))).status,
    ).toBe(200);
    expect(service.bind).toHaveBeenCalledWith(
      { userId: "user_123", organizationId: "org_123" },
      "C123",
      body.projectId,
    );
  });
  it("does not return credentials and disables caching", async () => {
    const response = await controller.status(
      new Request(
        "https://whydidwechoosethis.tech/api/slack/settings?organizationId=org_123",
      ),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      workspace: null,
      canManage: true,
      projects: [],
    });
  });
});
