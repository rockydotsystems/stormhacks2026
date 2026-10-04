import "server-only";
import { env } from "cloudflare:workers";

// The live layer from the server's side. A Durable Object per conversation holds the open
// sockets. The server asks it who is present and tells it when something changed. Neither call
// may break a chat: with no live layer, presence is empty and nobody is told, and every client
// still sees the truth the next time it fetches.

export type Presence = { userId: string; displayName: string };

export type ChangeReason = "message" | "document" | "standby" | "participants";

export interface RealtimePort {
  presence(conversationId: string): Promise<Presence[]>;
  notify(conversationId: string, reason: ChangeReason): Promise<void>;
}

// The room's RPC surface. The class itself lives in the realtime Worker.
interface RoomRpc {
  presence(): Promise<Presence[]>;
  notify(reason: ChangeReason): Promise<void>;
}

export class DurableObjectRealtime implements RealtimePort {
  private room(conversationId: string) {
    const namespace = env.CHAT_ROOM as unknown as DurableObjectNamespace<
      RoomRpc & Rpc.DurableObjectBranded
    >;
    return namespace.get(namespace.idFromName(conversationId));
  }

  async presence(conversationId: string): Promise<Presence[]> {
    try {
      return await this.room(conversationId).presence();
    } catch (error) {
      console.error("Realtime presence failed", error);
      return [];
    }
  }

  async notify(conversationId: string, reason: ChangeReason): Promise<void> {
    try {
      await this.room(conversationId).notify(reason);
    } catch (error) {
      console.error("Realtime notify failed", error);
    }
  }
}
