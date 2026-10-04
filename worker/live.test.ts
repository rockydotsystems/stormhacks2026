import { describe, expect, it, vi } from "vitest";
import { connectLive, liveConversationId, type Rooms } from "./live";

const ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://example.test";

function upgrade(init: { origin?: string | null; cookie?: string } = {}) {
  const headers = new Headers({ Upgrade: "websocket" });
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set("Origin", origin);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new Request(`${ORIGIN}/api/planning/conversations/${ID}/live`, {
    headers,
  });
}

function rooms() {
  const fetched: Request[] = [];
  const names: string[] = [];
  const value: Rooms = {
    idFromName: (name) => {
      names.push(name);
      return name;
    },
    get: () => ({
      fetch: async (request) => {
        fetched.push(request);
        return new Response("room", { status: 200 });
      },
    }),
  };
  return { value, fetched, names };
}

const allow = (body: unknown) => async () => Response.json(body);

describe("liveConversationId", () => {
  it("matches only a WebSocket upgrade on the live path", () => {
    expect(liveConversationId(upgrade())).toBe(ID);
    expect(
      liveConversationId(
        new Request(`${ORIGIN}/api/planning/conversations/${ID}/live`),
      ),
    ).toBeNull();
    expect(
      liveConversationId(
        new Request(`${ORIGIN}/api/planning/conversations/${ID}/messages`, {
          headers: { Upgrade: "websocket" },
        }),
      ),
    ).toBeNull();
    expect(
      liveConversationId(
        new Request(`${ORIGIN}/api/planning/conversations/not-an-id/live`, {
          headers: { Upgrade: "websocket" },
        }),
      ),
    ).toBeNull();
  });
});

describe("connectLive", () => {
  it("rejects another origin, or none, before asking the app anything", async () => {
    const ask = vi.fn();
    const { value } = rooms();
    for (const origin of ["https://evil.test", null]) {
      const response = await connectLive(upgrade({ origin }), ID, value, ask);
      expect(response.status).toBe(403);
    }
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks the app with the caller's cookie and nothing else", async () => {
    const ask = vi.fn<(request: Request) => Promise<Response>>(
      allow({ userId: "u1", displayName: "Ana S." }),
    );
    await connectLive(upgrade({ cookie: "wos=abc" }), ID, rooms().value, ask);
    const sent = ask.mock.calls[0][0] as Request;
    expect(new URL(sent.url).pathname).toBe(
      `/api/planning/conversations/${ID}/live-access`,
    );
    expect(sent.headers.get("cookie")).toBe("wos=abc");
    expect(sent.headers.get("Upgrade")).toBeNull();
  });

  it("passes the app's refusal on without touching the room", async () => {
    const { value, fetched } = rooms();
    const signedOut = await connectLive(
      upgrade(),
      ID,
      value,
      async () => new Response(null, { status: 401 }),
    );
    expect(signedOut.status).toBe(401);
    const notMember = await connectLive(
      upgrade(),
      ID,
      value,
      async () => new Response(null, { status: 404 }),
    );
    expect(notMember.status).toBe(404);
    const broken = await connectLive(
      upgrade(),
      ID,
      value,
      async () => new Response(null, { status: 500 }),
    );
    expect(broken.status).toBe(404);
    expect(fetched).toEqual([]);
  });

  it("refuses an answer without a usable identity", async () => {
    const { value, fetched } = rooms();
    const response = await connectLive(
      upgrade(),
      ID,
      value,
      allow({ userId: 7 }),
    );
    expect(response.status).toBe(404);
    expect(fetched).toEqual([]);
  });

  it("opens the room for this conversation with the verified identity, replacing spoofed headers", async () => {
    const { value, fetched, names } = rooms();
    const request = upgrade();
    request.headers.set("X-User-Id", "attacker");
    request.headers.set("X-Display-Name", "Mallory");
    const response = await connectLive(
      request,
      ID,
      value,
      allow({ userId: "u1", displayName: "Zoë K." }),
    );
    expect(response.status).toBe(200);
    expect(names).toEqual([ID]);
    expect(fetched[0].headers.get("X-User-Id")).toBe("u1");
    expect(decodeURIComponent(fetched[0].headers.get("X-Display-Name")!)).toBe(
      "Zoë K.",
    );
    expect(fetched[0].headers.get("Upgrade")).toBe("websocket");
  });
});
