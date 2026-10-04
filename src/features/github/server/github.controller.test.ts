import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubController } from "./github.controller";
import { ApiError } from "@/server/errors";

const organizationId = "org_testgithub";
const state = "a".repeat(43);
it("accepts WorkOS organization IDs for GitHub status", async () => {
  const { controller, githubService } = setup();
  const response = await controller.status(
    new Request(`https://app.test/api/github?organizationId=${organizationId}`),
  );
  expect(response.status).toBe(200);
  expect(githubService.status).toHaveBeenCalledWith({
    userId: "workos-user",
    organizationId,
  });
});

it.each(["", "f21f884a-71cf-41fc-ae62-15e6485b7937", "org_bad-id"])(
  "rejects invalid GitHub organization selection %s",
  async (value) => {
    const { controller, githubService } = setup();
    await expect(
      controller.status(
        new Request(`https://app.test/api/github?organizationId=${value}`),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(githubService.status).not.toHaveBeenCalled();
  },
);
function setup() {
  const authService = {
    requireUser: vi.fn().mockResolvedValue({ id: "workos-user" }),
  };
  const githubService = {
    begin: vi.fn().mockResolvedValue({
      state,
      url: "https://github.com/login/oauth/authorize",
    }),
    complete: vi
      .fn()
      .mockResolvedValue({ organizationId, selection: "b".repeat(43) }),
    choices: vi.fn().mockResolvedValue({ installations: [] }),
    select: vi.fn(),
    consumeState: vi.fn(),
    status: vi.fn().mockResolvedValue({ configured: true }),
    sync: vi.fn(),
    webhook: vi.fn(),
  };
  const controller = new GitHubController({ authService, githubService });
  return { controller, authService, githubService };
}
function callback(query: string, cookie = state) {
  return new Request(`https://app.test/api/github/callback?${query}`, {
    headers: { cookie: `github_oauth_state=${cookie}` },
  });
}
function webhook(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/github/webhooks", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-event": "push",
      "x-github-delivery": "12839123-457f-4db3-a598-32ad10c993ea",
      "x-hub-signature-256": `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`,
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_WORKOS_REDIRECT_URI", "https://app.test/callback");
  for (const key of [
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
  ])
    vi.stubEnv(key, "test-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GitHub controller", () => {
  it("lists authorized installations without exposing the selection cookie", async () => {
    const { controller, githubService } = setup();
    const cookie = "c".repeat(43);
    await controller.installations(
      new Request(
        `https://app.test/api/github/installations?organizationId=${organizationId}`,
        { headers: { cookie: `github_installation_selection=${cookie}` } },
      ),
    );
    expect(githubService.choices).toHaveBeenCalledWith(
      { userId: "workos-user", organizationId },
      cookie,
    );
    const response = await controller.installations(
      new Request(
        `https://app.test/api/github/installations?organizationId=${organizationId}`,
      ),
    );
    expect(await response.json()).toEqual({
      installations: [],
      authorized: false,
    });
  });

  it("links only through a same-origin form with the HttpOnly selection handle", async () => {
    const { controller, githubService } = setup();
    const selection = "c".repeat(43);
    const request = () =>
      new Request("https://app.test/api/github/installations", {
        method: "POST",
        headers: {
          origin: "https://app.test",
          cookie: `github_installation_selection=${selection}`,
        },
        body: new URLSearchParams({ organizationId, installationId: "123" }),
      });
    const response = await controller.select(request());
    expect(githubService.select).toHaveBeenCalledWith(
      { userId: "workos-user", organizationId },
      selection,
      "123",
    );
    expect(response.headers.get("location")).toContain("github=connected");
    expect(response.headers.get("set-cookie")).toContain(
      "github_installation_selection=; Path=/api/github; Max-Age=0",
    );
    await expect(
      controller.select(
        new Request("https://app.test/api/github/installations", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("starts OAuth only for an authenticated same-origin form and binds the organization", async () => {
    const { controller, githubService } = setup();
    const response = await controller.connect(
      new Request("https://app.test/api/github/connect", {
        method: "POST",
        headers: { origin: "https://app.test" },
        body: new URLSearchParams({
          organizationId,
        }),
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(githubService.begin).toHaveBeenCalledWith({
      userId: "workos-user",
      organizationId,
    });
    await expect(
      controller.connect(
        new Request("https://app.test/api/github/connect", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing, changed or malformed state before exchanging a code", async () => {
    const { controller, githubService, authService } = setup();
    for (const request of [
      callback("code=abc"),
      callback(`state=${state}&code=abc`, "b".repeat(43)),
      callback("state=short&code=abc"),
    ]) {
      const response = await controller.callback(request);
      expect(response.headers.get("location")).toBe(
        "https://app.test/settings/github?github=restart",
      );
    }
    expect(githubService.complete).not.toHaveBeenCalled();
    expect(authService.requireUser).not.toHaveBeenCalled();
  });

  it("completes under the current identity, ignores client installation IDs and clears state", async () => {
    const { controller, githubService } = setup();
    const response = await controller.callback(
      callback(
        `state=${state}&code=abc&installation_id=9999&returnTo=https://evil.test`,
      ),
    );
    expect(githubService.complete).toHaveBeenCalledWith(
      "workos-user",
      state,
      "abc",
    );
    expect(response.headers.get("location")).toContain(
      `organizationId=${organizationId}`,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("requires a WorkOS session before consuming a matching callback state", async () => {
    const { controller, authService, githubService } = setup();
    authService.requireUser.mockRejectedValue(new ApiError(401, "Sign in."));
    await expect(
      controller.callback(callback(`state=${state}&code=abc`)),
    ).rejects.toMatchObject({ status: 401 });
    expect(githubService.complete).not.toHaveBeenCalled();
  });

  it("handles cancellation and provider errors without leaking credentials", async () => {
    const { controller, githubService } = setup();
    expect(
      (
        await controller.callback(
          callback(`state=${state}&error=access_denied`),
        )
      ).headers.get("location"),
    ).toContain("github=denied");
    expect(githubService.consumeState).toHaveBeenCalledWith(
      "workos-user",
      state,
    );
    githubService.complete.mockRejectedValue(
      new ApiError(403, "provider details"),
    );
    expect(
      (
        await controller.callback(callback(`state=${state}&code=abc`))
      ).headers.get("location"),
    ).toContain("github=access");
  });

  it("requires authentication for status and sync, but not signed webhooks", async () => {
    const { controller, authService } = setup();
    authService.requireUser.mockRejectedValue(new ApiError(401, "Sign in."));
    await expect(
      controller.status(
        new Request(
          `https://app.test/api/github?organizationId=${organizationId}`,
        ),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.sync(
        new Request("https://app.test/api/github/sync", { method: "POST" }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await controller.webhook(webhook("{}", { "x-github-event": "ping" })))
        .status,
    ).toBe(202);
  });

  it("authenticates bytes before parsing and rejects unsigned or malformed deliveries", async () => {
    const { controller, githubService } = setup();
    await expect(
      controller.webhook(webhook("not json", { "x-hub-signature-256": "bad" })),
    ).rejects.toMatchObject({ status: 401 });
    await expect(controller.webhook(webhook("not json"))).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(
      controller.webhook(webhook("{}", { "x-github-delivery": "invalid" })),
    ).rejects.toMatchObject({ status: 400 });
    expect(githubService.webhook).not.toHaveBeenCalled();
  });

  it("passes only validated event metadata to storage", async () => {
    const { controller, githubService } = setup();
    const response = await controller.webhook(
      webhook(
        JSON.stringify({
          installation: { id: 123 },
          repository: { id: 456, name: "repo", owner: { login: "org" } },
          commits: [{ secret: "not stored" }],
        }),
      ),
    );
    expect(response.status).toBe(202);
    expect(githubService.webhook).toHaveBeenCalledWith(
      "12839123-457f-4db3-a598-32ad10c993ea",
      "push",
      {
        installation: { id: "123" },
        repository: { id: "456", name: "repo", owner: { login: "org" } },
      },
    );
  });
});
