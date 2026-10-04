import { z } from "zod";
import type { OrganizationActor } from "@/features/organizations/contracts";
import type { ChatSource } from "@/features/project-chat/contracts";
import { readLimitedBody } from "@/features/github/server/security";

async function providerJson(response: Response) {
  if (!response.ok) throw new Error("Slack provider request failed.");
  return JSON.parse(
    (await readLimitedBody(response, 64 * 1024)).toString("utf8"),
  ) as unknown;
}

export class SlackClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async request(url: string, token: string, body: unknown) {
    return providerJson(
      await this.fetcher(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async botToken(actor: OrganizationActor, teamId: string) {
    let token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      const key = process.env.WORKOS_API_KEY;
      if (!key) throw new Error("WorkOS is not configured.");
      const result = z
        .object({
          active: z.literal(true),
          credential: z.object({
            value: z.string().min(1),
            missing_scopes: z.array(z.string()).optional(),
          }),
        })
        .parse(
          await this.request(
            "https://api.workos.com/data-integrations/slack/credentials",
            key,
            {
              connection_owner: "organization",
              organization_id: actor.organizationId,
              user_id: actor.userId,
            },
          ),
        );
      if (result.credential.missing_scopes?.length)
        throw new Error("Slack connection needs reauthorization.");
      token = result.credential.value;
    }
    const auth = z
      .object({
        ok: z.literal(true),
        team_id: z.string(),
        bot_id: z.string().min(1),
      })
      .parse(await this.request("https://slack.com/api/auth.test", token, {}));
    if (auth.team_id !== teamId)
      throw new Error("Slack credential belongs to another workspace.");
    return token;
  }

  async reply(
    token: string,
    channel: string,
    threadTs: string,
    answer: string,
    sources: ChatSource[],
  ) {
    const origin = new URL(
      process.env.SLACK_APP_ORIGIN || "https://whydidwechoosethis.tech",
    );
    if (origin.protocol !== "https:" && origin.hostname !== "localhost")
      throw new Error("Invalid Slack app origin.");
    const blocks: unknown[] = [];
    for (let offset = 0; offset < answer.length; offset += 2800) {
      blocks.push({
        type: "section",
        text: {
          type: "plain_text",
          text: answer.slice(offset, offset + 2800),
          emoji: false,
        },
      });
    }
    for (const source of sources.slice(0, 6)) {
      const url = new URL(
        `/documents/${encodeURIComponent(source.documentId)}`,
        origin,
      );
      url.searchParams.set("change", source.changeId);
      blocks.push({
        type: "section",
        text: {
          type: "plain_text",
          text: `[${source.id}] ${source.title.slice(0, 200)}`,
          emoji: false,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "View decision" },
          url: url.href,
        },
      });
    }
    z.object({ ok: z.literal(true), ts: z.string() }).parse(
      await this.request("https://slack.com/api/chat.postMessage", token, {
        channel,
        thread_ts: threadTs,
        text: answer
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;"),
        blocks,
        unfurl_links: false,
        unfurl_media: false,
        parse: "none",
      }),
    );
  }
}
