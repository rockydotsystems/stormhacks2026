import { afterEach, describe, expect, it, vi } from "vitest";
import { SlackClient } from "./slack.client";

const actor = { organizationId: "org_123", userId: "user_123" };
afterEach(() => vi.unstubAllEnvs());
describe("Slack bot credentials and replies", () => {
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
