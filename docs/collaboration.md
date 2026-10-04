# Teammate collaboration and standby mode

**Status:** implemented on `feat/planning-collaboration`. It builds on [planning-session-agent.md](planning-session-agent.md).

## What it does

- **One chat, many people.** Organization members who open a document's chat join the same conversation and talk to the same agent. Everyone sees every message.
- **Standby.** While two or more people have the chat open, the agent goes quiet. It says so once, in fixed words, then leaves the document alone while people discuss tradeoffs.
- **Agreement.** After each message in standby, Jev checks whether the people agreed. When they did, the agent updates the document from the discussion and standby ends. Anyone can also press **Apply now**.
- **Display.** Other people appear on the left, boxed and tinted, under their name. The agent keeps its plain text style. Fixed notices (standby on and off) are dashed boxes.

## How people join

Opening a document calls `POST /api/planning/conversations` with `documentId` and `organizationId`. The docs layer proves the person belongs to that WorkOS organization. If the document already has a conversation, the person joins it as a participant. Otherwise a conversation is created.

A conversation with no document yet lives in its owner's personal organization and has no other members, so there is nothing to share until the first draft exists.

## Live layer

| Piece                        | Job                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/realtime` (`ChatRoom`) | One Durable Object per conversation. Holds the WebSockets, tracks who is present, tells clients to refetch. Stores no conversation data. |
| `worker/entry.ts`, `live.ts` | Handles the WebSocket upgrade before the app, because vinext drops the socket from a route handler's response. See below.                |
| `GET .../live-access`        | The app tells the entry who the caller is and whether they may join. The cookie is checked here, never in the room.                      |
| `src/.../realtime.ts`        | The server's view of the room: `presence()` and `notify()`. Failures never break a chat.                                                 |
| `use-live-conversation.ts`   | The browser side: connect, reconnect, reload on change, ask the server to sync standby.                                                  |

Postgres is the source of truth. A "changed" message only says "refetch". Postgres LISTEN/NOTIFY is not an option, because Hyperdrive pools in transaction mode.

**Presence** is any open socket. Two tabs of one person count once. A closed socket keeps its person present for 10 seconds, so a page refresh does not flicker the chat in and out of standby.

**Why a custom Worker entry.** vinext rewraps route handler responses and drops the `webSocket` field of a `101`. `worker/entry.ts` re-exports vinext's handler and intercepts only `Upgrade: websocket` on `/api/planning/conversations/:id/live`. It rejects other origins, asks the app for access, and forwards the upgrade to the room with the verified identity. Identity headers from the client are overwritten.

## Standby rules

- The **server** decides. A client only says when to look (`POST .../standby/sync`). The server reads presence from the room and counts only participants.
- Entering and leaving are single-winner. The store locks the conversation row, so concurrent callers announce once.
- A down live layer reads as "one person", so chat keeps working normally.
- In standby, messages are stored with their author and the agent does not run. The turn lease is only taken when applying.
- On apply, the agent receives the full history with each message labeled by name, then a fixed request (`APPLY_REQUEST`). The change's source covers the whole discussion. Standby ends in the same transaction as the change.
- Publishing stays a human button. Nothing here can publish.

## Jev

Jev ([docs](https://docs.typesafe.ai)) answers yes/no questions with a probability. We ask three in one request: agreement, remaining objection, and a direct request to update. **Code** decides from the numbers, in `agreement.ts`.

- At least two different people must have spoken since standby began. Otherwise Jev is not asked.
- Jev reads questions literally and can be steered by the text it reads, so no number is trusted alone. A failure of any kind means "not agreed", and Apply now is the fallback.
- The model is pinned (`jev-1.13.0`), because the alias moves with each release and would move our thresholds.
- The key and chat text are never logged.

Thresholds were checked against 13 labeled chats on the live API (`agreement.live.test.ts`). Every chat where people did not agree scored agreement 0.43 or lower. Every real agreement scored 0.89 or higher. The cutoff is 0.85. Run the live eval before changing any threshold, and add a case whenever a real chat is misjudged:

```sh
TYPESAFE_API_KEY=... pnpm exec vitest run src/features/planning/server/agreement.live.test.ts
```

## Configuration

| Variable           | Where                                                    | Notes                               |
| ------------------ | -------------------------------------------------------- | ----------------------------------- |
| `TYPESAFE_API_KEY` | `.dev.vars` locally, `wrangler secret put` in production | Optional. Without it, Apply now.    |
| `TYPESAFE_MODEL`   | Same                                                     | Optional. Defaults to `jev-1.13.0`. |

## Deployment

`pnpm run deploy` publishes the realtime Worker first, then the app, because the app binds to the Durable Object. `pnpm deploy:check` dry-runs both. The Durable Object migration (`new_sqlite_classes`) lives in `apps/realtime/wrangler.jsonc`.

## Known limits

- Voice is single-user. The voice button is off during standby.
- The older `PlanningConversation` view does not show teammates. The document chat does.
- The browser hook was tested through its pure logic and the room was tested end to end, but two real signed-in browsers have not been run together.
- Jev's rate limits change without notice. A 429 or 529 is retried twice, then treated as "not agreed".
