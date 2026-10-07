import { afterEach, describe, expect, it, vi } from "vitest";
import { SlackClient } from "./slack.client";
import { shareableChannel } from "./slack.client";

const actor = { organizationId: "org_123", userId: "user_123" };
afterEach(() => vi.unstubAllEnvs());
describe("Slack bot credentials and replies", () => {
  it("sends channel lookup parameters in the query string, not a JSON body", async () => {
    const channel = { id: "C123", name: "demo", is_member: true };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(String(input));
        if (
          init?.method !== "GET" ||
          url.searchParams.get("channel") !== channel.id
        )
          return Response.json({ ok: false, error: "invalid_arguments" });
        expect(url.origin + url.pathname).toBe(
          "https://slack.com/api/conversations.info",
        );
        expect(init.body).toBeUndefined();
        expect(new Headers(init.headers).get("Authorization")).toBe(
          "Bearer test-token",
        );
        expect(init.redirect).toBe("manual");
        return Response.json({ ok: true, channel });
      });
    await expect(
      new SlackClient(fetcher).channel("test-token", channel.id),
    ).resolves.toEqual(channel);
  });
  it("sends user lookup parameters in the query string", async () => {
    const user = {
      id: "U123",
      team_id: "T123",
      profile: { email: "test@example.com" },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(String(input));
        if (init?.method !== "GET" || url.searchParams.get("user") !== user.id)
          return Response.json({ ok: false, error: "invalid_arguments" });
        expect(url.pathname).toBe("/api/users.info");
        expect(init.body).toBeUndefined();
        return Response.json({ ok: true, user });
      });
    await expect(
      new SlackClient(fetcher).user("test-token", user.id),
    ).resolves.toEqual(user);
  });
  it("preserves channel filters and pagination in query parameters", async () => {
    const channel = { id: "C123", name: "demo", is_member: true };
    const cursor = "next+page/=&";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = new URL(String(input));
        if (
          init?.method !== "GET" ||
          url.searchParams.get("types") !== "public_channel,private_channel"
        )
          return Response.json({ ok: false, error: "invalid_arguments" });
        expect(url.pathname).toBe("/api/conversations.list");
        expect(url.searchParams.get("exclude_archived")).toBe("true");
        expect(url.searchParams.get("limit")).toBe("200");
        expect(init.body).toBeUndefined();
        const nextPage = url.searchParams.get("cursor") === cursor;
        return Response.json({
          ok: true,
          channels: nextPage
            ? [channel, { ...channel, id: "C999", is_shared: true }]
            : [],
          response_metadata: { next_cursor: nextPage ? "" : cursor },
        });
      });
    await expect(
      new SlackClient(fetcher).channels("test-token"),
    ).resolves.toEqual([channel]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reports provider status and safe error codes without exposing the response body", async () => {
    const client = new SlackClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            code: "invalid_api_key",
            message: "sensitive-provider-details",
            credential: "private-token",
          },
          { status: 401 },
        ),
      ),
    );
    await expect(client.authorize(actor)).rejects.toThrow(
      "HTTP 401; code invalid_api_key.",
    );
  });
  it("uses Workers-compatible manual redirects for provider requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        if (init?.redirect === "error")
          throw new TypeError("Invalid redirect value in Workers");
        expect(init?.redirect).toBe("manual");
        return Response.json({ url: "https://api.workos.com/test-authorize" });
      });
    await expect(new SlackClient(fetcher).authorize(actor)).resolves.toBe(
      "https://api.workos.com/test-authorize",
    );
  });
  it("rejects provider redirects without following them or forwarding credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.invalid" },
      }),
    );
    await expect(new SlackClient(fetcher).authorize(actor)).rejects.toThrow(
      "Slack provider request failed.",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("authorizes the acting admin through organization-owned Pipes with a fixed return URL", async () => {
    vi.stubEnv("WORKOS_API_KEY", "test-key");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ url: "https://api.workos.com/test-authorize" }),
      );
    expect(await new SlackClient(fetcher).authorize(actor)).toBe(
      "https://api.workos.com/test-authorize",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      connection_owner: "organization",
      organization_id: actor.organizationId,
      user_id: actor.userId,
      return_to:
        "https://whydidwechoosethis.tech/settings/slack?organizationId=org_123",
    });
    await expect(
      new SlackClient(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json({ url: "https://attacker.invalid" }),
          ),
      ).authorize(actor),
    ).rejects.toThrow();
  });
  it("excludes shared, archived, and nonmember channels", () => {
    const channel = { id: "C123", name: "demo", is_member: true };
    expect(shareableChannel(channel)).toBe(true);
    for (const flag of [
      "is_shared",
      "is_ext_shared",
      "is_org_shared",
      "is_archived",
    ] as const)
      expect(shareableChannel({ ...channel, [flag]: true })).toBe(false);
    expect(shareableChannel({ ...channel, is_member: false })).toBe(false);
  });
  it("vends an organization-owned Pipes credential and checks the bot workspace", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "");
    vi.stubEnv("WORKOS_API_KEY", "test-key");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          active: true,
          credential: { value: "test-token", missing_scopes: [] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ ok: true, bot_id: "B123", team_id: "T123" }),
      );
    expect(await new SlackClient(fetcher).botToken(actor, "T123")).toBe(
      "test-token",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      connection_owner: "organization",
      organization_id: "org_123",
      user_id: "user_123",
    });
  });
  it("rejects user tokens, wrong workspaces, missing scopes, and disconnected accounts", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "test-token");
    for (const auth of [
      { ok: true, team_id: "T123" },
      { ok: true, bot_id: "B123", team_id: "T999" },
    ]) {
      await expect(
        new SlackClient(
          vi.fn<typeof fetch>().mockResolvedValue(Response.json(auth)),
        ).botToken(actor, "T123"),
      ).rejects.toThrow();
    }
    vi.stubEnv("SLACK_BOT_TOKEN", "");
    vi.stubEnv("WORKOS_API_KEY", "test-key");
    for (const value of [
      { active: false },
      {
        active: true,
        credential: { value: "test-token", missing_scopes: ["chat:write"] },
      },
    ]) {
      await expect(
        new SlackClient(
          vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)),
        ).botToken(actor, "T123"),
      ).rejects.toThrow();
    }
  });
  it("posts in-thread, renders generated text literally, and builds trusted source links", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true, ts: "123.456" }));
    await new SlackClient(fetcher).reply(
      "test-token",
      "C123",
      "111.222",
      "MSSQL supports reporting [1]. <!channel>",
      [
        {
          id: "1",
          title: "Database choice",
          documentId: "doc-123",
          changeId: "7",
          version: 1,
          createdAt: "2026-10-04",
          href: "https://attacker.invalid",
        },
      ],
    );
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get("Content-Type"),
    ).toBe("application/json");
    expect(body.thread_ts).toBe("111.222");
    expect(body.blocks[0].text.type).toBe("plain_text");
    expect(body.text).not.toContain("<!channel>");
    expect(body.blocks[1].accessory.url).toBe(
      "https://whydidwechoosethis.tech/documents/doc-123?change=7",
    );
    expect(body.unfurl_links).toBe(false);
  });
  it("treats Slack's HTTP-200 API error as delivery failure", async () => {
    const client = new SlackClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ ok: false, error: "not_in_channel" }),
        ),
    );
    await expect(
      client.reply("test-token", "C123", "111.222", "Answer", []),
    ).rejects.toThrow();
  });
});
