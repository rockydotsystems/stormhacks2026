# Slack decision bot

Mention `@whydidwechoosethis` in a configured channel to ask about that channel's
project decisions. Answers arrive in the same thread with links to the recorded
changes. The bot reuses project-history search and grounded answers; it does not
read personal chats, crawl Slack history, or edit decisions. Each mention is a
standalone question (thread context is not yet included).

## Quick demo setup

1. Create a Slack app at <https://api.slack.com/apps>, with a bot named
   `whydidwechoosethis`. Add bot scopes `app_mentions.read` and `chat:write`.
2. Install it in your workspace and invite the bot to your demo channel.
3. Set `SLACK_SIGNING_SECRET` from **Basic Information** and `SLACK_APP_ID`
   (the `A…` ID). For the fastest single-workspace setup, set `SLACK_BOT_TOKEN`
   to its bot token. Never paste secrets into chat or commit them.
4. Set `SLACK_BINDINGS` to a JSON array using the example below. Get the channel
   ID from channel details and the Slack user ID from the profile's **Copy member
   ID** action. Use the project's UUID and the matching WorkOS organization/user
   IDs from your application. Do not map strangers to an administrator's identity.
5. Apply the new migration with `pnpm db:migrate` using your migration credentials
   in `.env.local`. Deploy only with approval, then enable **Event Subscriptions**
   with request URL `https://whydidwechoosethis.tech/api/slack/events`. Subscribe
   to the bot event `app_mention`; reinstall if Slack requests it.
6. Send `@whydidwechoosethis, why are we using an mssql database?` in the configured
   channel. The existing every-minute Worker cron processes one queued answer
   per invocation, so allow roughly one minute plus generation time.

For local development, put runtime settings in `.dev.vars`, and expose `pnpm dev`
through an HTTPS tunnel. Use that URL for Event Subscriptions and set
`SLACK_APP_ORIGIN` to the application's URL. Local cron needs to be invoked via
Wrangler's scheduled-event testing endpoint; it does not run automatically.

```dotenv
SLACK_SIGNING_SECRET=<signing secret>
SLACK_APP_ID=A123EXAMPLE
SLACK_BOT_TOKEN=<bot token, optional when using Pipes>
SLACK_APP_ORIGIN=https://whydidwechoosethis.tech
SLACK_BINDINGS='[{"teamId":"T123EXAMPLE","channelId":"C123EXAMPLE","organizationId":"org_example","projectId":"00000000-0000-4000-8000-000000000001","users":{"U123EXAMPLE":"user_example"}}]'
```

The operator explicitly authorizes sharing the project's decisions (including
drafts and recorded rationale) with **everyone who can see the configured Slack
channel**. Use a private, non-Slack-Connect demo channel containing only authorized
project members. The user map controls who can ask, not who can read replies.
Unconfigured channels/users are silently ignored. Active WorkOS membership and
project ownership are checked before retrieval and again before posting.

## Use WorkOS Pipes

In the WorkOS Dashboard, configure Slack with your Slack app's OAuth credentials,
the displayed redirect URI, bot scopes, and **Organization** connection ownership.
An organization admin establishes the shared connection through Pipes Admin (the
`widgets:pipes:manage` permission is required). This first version does not add an
in-app connection management UI.

Remove `SLACK_BOT_TOKEN` to select Pipes. The backend calls
`POST /data-integrations/slack/credentials` with `connection_owner: "organization"`,
the mapped acting user's ID, and the bound organization ID. WorkOS stores and
refreshes credentials. The bot validates the credential with Slack `auth.test`:
it must identify a bot in the same workspace as the event. A user credential or
another workspace's token is rejected. Confirm the configured Slack provider
returns a bot credential; use the direct demo token if it does not.

## Delivery and troubleshooting

`/api/slack/events` is handled directly by the Worker, outside browser login
middleware. Requests require Slack's HMAC signature and a timestamp within five
minutes, including URL verification. Bodies are capped at 64 KiB. The webhook
acknowledges after persisting a job, never after model generation. `event_id` is
the primary key, so Slack retries do not enqueue duplicate jobs.

Jobs atomically claim a three-minute lease. Generation failures retry up to three
attempts; expired generation leases can be reclaimed. Delivery is deliberately
not automatically retried: a network timeout may mean Slack already posted the
answer. Inspect `slack_jobs.status` (`pending`, `processing`, `sending`, `sent`,
`failed`, or `cancelled`) and Worker logs. `sending` after a crash is ambiguous;
check the thread before retrying manually. There is no exactly-once delivery
guarantee across Postgres and Slack.

For no response, check the channel/user binding, bot membership in the channel,
`SLACK_APP_ID`, signing secret, cron, and migration. For failed answers, check
WorkOS membership, the shared connection, AI credentials, and bot scopes. If the
decision is not recorded, the bot says so rather than inventing a reason.

Production hardening beyond this demo: a connection-management UI, automated
identity linking, channel membership/access policy, dedicated queue throughput,
rate limits, and job retention/cleanup.
