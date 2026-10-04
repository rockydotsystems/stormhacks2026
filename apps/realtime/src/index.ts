import { DurableObject } from "cloudflare:workers";

// Spike: proves a WebSocket upgrade can reach a Durable Object through the main app.
export class ChatRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws: WebSocket) {
    ws.close();
    this.broadcast();
  }

  private broadcast() {
    const message = JSON.stringify({
      type: "presence",
      count: this.ctx.getWebSockets().length,
    });
    for (const ws of this.ctx.getWebSockets()) ws.send(message);
  }
}

export default {
  fetch: () => new Response("Not found.", { status: 404 }),
} satisfies ExportedHandler;
