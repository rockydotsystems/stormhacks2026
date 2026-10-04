// Opens a live (WebSocket) connection to a conversation's chat room. This runs in the Worker
// entry, before the app, because vinext drops the WebSocket from a route handler's response.
// The app still decides who may connect: this asks it, then forwards the upgrade to the room
// with the verified identity.

export const LIVE_PATH =
  /^\/api\/planning\/conversations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/live$/i;

export const USER_ID_HEADER = "X-User-Id";
export const DISPLAY_NAME_HEADER = "X-Display-Name";

type Room = { fetch(request: Request): Promise<Response> };
export type Rooms = {
  idFromName(name: string): unknown;
  get(id: never): Room;
};

export function liveConversationId(request: Request): string | null {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
    return null;
  return LIVE_PATH.exec(new URL(request.url).pathname)?.[1] ?? null;
}

export async function connectLive(
  request: Request,
  conversationId: string,
  rooms: Rooms,
  askApp: (request: Request) => Promise<Response>,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  // Browsers always send Origin on a WebSocket. Anything else is not our own page.
  if (request.headers.get("Origin") !== origin)
    return new Response("Forbidden.", { status: 403 });

  const access = await askApp(
    new Request(
      `${origin}/api/planning/conversations/${conversationId}/live-access`,
      { headers: { cookie: request.headers.get("cookie") ?? "" } },
    ),
  );
  if (!access.ok) {
    return new Response(access.status === 401 ? "Sign in." : "Not found.", {
      status: access.status === 401 ? 401 : 404,
    });
  }
  const identity = (await access.json()) as {
    userId?: unknown;
    displayName?: unknown;
  };
  if (
    typeof identity.userId !== "string" ||
    typeof identity.displayName !== "string"
  )
    return new Response("Not found.", { status: 404 });

  // set() replaces anything the client sent under these names, so identity cannot be spoofed.
  const headers = new Headers(request.headers);
  headers.set(USER_ID_HEADER, identity.userId);
  headers.set(DISPLAY_NAME_HEADER, encodeURIComponent(identity.displayName));
  const room = rooms.get(rooms.idFromName(conversationId) as never);
  return room.fetch(new Request(request, { headers }));
}
