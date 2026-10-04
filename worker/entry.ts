import app from "vinext/server/fetch-handler";

export * from "vinext/server/fetch-handler";

// vinext rewraps route handler responses and drops the WebSocket on a 101, so upgrades are
// handled here, before the app. Spike: no auth yet.
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (
      request.headers.get("Upgrade") === "websocket" &&
      url.pathname === "/api/spike/live"
    ) {
      const room = env.CHAT_ROOM;
      return room.get(room.idFromName("spike")).fetch(request);
    }
    return (app as any).fetch(request, env, ctx);
  },
};
