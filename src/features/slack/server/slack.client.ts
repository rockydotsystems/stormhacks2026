import { z } from "zod";
import type { OrganizationActor } from "@/features/organizations/contracts";
import type { ChatSource } from "@/features/project-chat/contracts";
import { readLimitedBody } from "@/features/github/server/security";
import { slackOrigin } from "./config";

const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_member: z.boolean().optional(),
  is_archived: z.boolean().optional(),
  is_shared: z.boolean().optional(),
  is_ext_shared: z.boolean().optional(),
  is_org_shared: z.boolean().optional(),
});
export function shareableChannel(channel: z.infer<typeof channelSchema>) {
  return Boolean(
    channel.is_member &&
    !channel.is_archived &&
    !channel.is_shared &&
    !channel.is_ext_shared &&
    !channel.is_org_shared,
  );
}

async function providerJson(response: Response) {
  if (!response.ok) {
    const body = await readLimitedBody(response, 64 * 1024).catch(() => null);
    let code = "unknown";
    try {
      const parsed = z
        .object({ code: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) })
        .safeParse(JSON.parse(body?.toString("utf8") || "null"));
      if (parsed.success) code = parsed.data.code;
    } catch {
      // Provider HTML and arbitrary error bodies must not enter application logs.
    }
    throw new Error(
      `Slack provider request failed. HTTP ${response.status}; code ${code}.`,
    );
  }
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
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  private async read(
    method: string,
    token: string,
    parameters: Record<string, string>,
  ) {
    const url = new URL(`https://slack.com/api/${method}`);
    url.search = new URLSearchParams(parameters).toString();
    return providerJson(
      await this.fetcher(url.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  async authorize(actor: OrganizationActor) {
    const result = z.object({ url: z.url() }).parse(
      await this.request(
        "https://api.workos.com/data-integrations/slack/authorize",
        process.env.WORKOS_API_KEY!,
        {
          connection_owner: "organization",
          organization_id: actor.organizationId,
          user_id: actor.userId,
          return_to: `${slackOrigin()}/settings/slack?organizationId=${encodeURIComponent(actor.organizationId)}`,
        },
      ),
    );
    const url = new URL(result.url);
    if (url.origin !== "https://api.workos.com")
      throw new Error("Unexpected Pipes authorization URL.");
    return url.href;
  }

  async sharedConnection(actor: OrganizationActor) {
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
          process.env.WORKOS_API_KEY!,
          {
            connection_owner: "organization",
            organization_id: actor.organizationId,
            user_id: actor.userId,
          },
        ),
      );
    if (result.credential.missing_scopes?.length)
      throw new Error("Slack connection needs reauthorization.");
    const auth = await this.identity(result.credential.value);
    return { token: result.credential.value, ...auth };
  }

  async identity(token: string) {
    return z
      .object({
        ok: z.literal(true),
        team_id: z.string().regex(/^T[A-Z0-9]+$/),
        team: z.string().optional(),
        bot_id: z.string().min(1),
      })
      .parse(await this.request("https://slack.com/api/auth.test", token, {}));
  }

  async channels(token: string) {
    const channels = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const result = z
        .object({
          ok: z.literal(true),
          channels: z.array(channelSchema),
          response_metadata: z
            .object({ next_cursor: z.string().optional() })
            .optional(),
        })
        .parse(
          await this.read("conversations.list", token, {
            types: "public_channel,private_channel",
            exclude_archived: "true",
            limit: "200",
            cursor,
          }),
        );
      channels.push(...result.channels.filter(shareableChannel));
      cursor = result.response_metadata?.next_cursor || "";
      if (!cursor) break;
    }
    return channels;
  }

  async channel(token: string, channel: string) {
    return z.object({ ok: z.literal(true), channel: channelSchema }).parse(
      await this.read("conversations.info", token, {
        channel,
      }),
    ).channel;
  }

  async user(token: string, user: string) {
    return z
      .object({
        ok: z.literal(true),
        user: z.object({
          id: z.string(),
          team_id: z.string(),
          deleted: z.boolean().optional(),
          is_bot: z.boolean().optional(),
          profile: z.object({ email: z.email().optional() }),
        }),
      })
      .parse(await this.read("users.info", token, { user })).user;
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
