import { DurableObject } from "cloudflare:workers";
import {
  dropExpired,
  listPresence,
  nextAlarm,
  startLeaving,
  stopLeaving,
  type Leaving,
  type Member,
} from "./presence";

// One room per planning conversation. It holds the open WebSockets and tells everyone who is
// here and when something changed. It stores no conversation data. Postgres stays the source of
// truth, and a "changed" message only tells a client to refetch.
//
// Only the main Worker reaches this class, through a binding. It has already checked the cookie
// and the person's access, and passes the verified identity in headers.

export const USER_ID_HEADER = "X-User-Id";
export const DISPLAY_NAME_HEADER = "X-Display-Name";

export type ChangeReason = "message" | "document" | "standby" | "participants";

export type ServerMessage =
  | { type: "presence"; users: Member[] }
  | { type: "changed"; reason: ChangeReason };

const LEAVING_KEY = "leaving";

export class ChatRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Keeps idle sockets alive without waking the room.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    const userId = request.headers.get(USER_ID_HEADER);
    if (!userId) return new Response("Missing identity.", { status: 400 });
    const member: Member = {
      userId,
      displayName: decodeURIComponent(
        request.headers.get(DISPLAY_NAME_HEADER) ?? "",
      ),
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(member);
    await this.save(stopLeaving(await this.load(), userId));
    await this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  // RPC: who is here now, for the server's standby decision.
  async presence(): Promise<Member[]> {
    return listPresence(this.connected(), await this.load(), Date.now());
  }

  // RPC: tell everyone to refetch.
  async notify(reason: ChangeReason): Promise<void> {
    this.send({ type: "changed", reason });
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    // 1005 and 1006 are reserved for local use and cannot be sent in a close frame.
    ws.close(code === 1005 || code === 1006 ? 1000 : code);
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  async alarm(): Promise<void> {
    const { leaving, changed } = dropExpired(await this.load(), Date.now());
    await this.save(leaving);
    if (changed) await this.broadcastPresence();
  }

  private connected(except?: WebSocket): Member[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
      .map((ws) => ws.deserializeAttachment() as Member | null)
      .filter((member): member is Member => Boolean(member));
  }

  private async left(ws: WebSocket): Promise<void> {
    const member = ws.deserializeAttachment() as Member | null;
    if (!member) return;
    const stillHere = this.connected(ws).some(
      (other) => other.userId === member.userId,
    );
    if (!stillHere) {
      await this.save(startLeaving(await this.load(), member, Date.now()));
    }
    await this.broadcastPresence();
  }

  private async broadcastPresence(): Promise<void> {
    this.send({ type: "presence", users: await this.presence() });
  }

  private send(message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    }
  }

  private async load(): Promise<Leaving> {
    return (await this.ctx.storage.get<Leaving>(LEAVING_KEY)) ?? {};
  }

  // Keeps the alarm on the earliest grace end, so a period that expires with nobody connected
  // still tells whoever is left.
  private async save(leaving: Leaving): Promise<void> {
    if (Object.keys(leaving).length === 0)
      await this.ctx.storage.delete(LEAVING_KEY);
    else await this.ctx.storage.put(LEAVING_KEY, leaving);
    const next = nextAlarm(leaving);
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}

const handler: ExportedHandler = {
  fetch: () => new Response("Not found.", { status: 404 }),
};

export default handler;
