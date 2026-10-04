import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "@/features/auth/server/auth.service";
import { ModelError } from "@/features/planning/server/model";
import { PlanningSessionController } from "@/features/planning/server/planning-session.controller";
import {
  formatEvent,
  sessionEventStream,
  toErrorEvent,
} from "@/features/planning/server/sse";
import type { SessionEvent } from "@/features/planning/session-contracts";
import { ApiError } from "@/server/errors";

const ORIGIN = "http://localhost:3000";
const CID = "6f1e8c3a-2b7d-4e55-9a3c-0d4f5a6b7c8d";
const USER = "user-a";

const requireUser = vi.fn();
const service = {
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  listChanges: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  getChangeSource: vi.fn(),
  sendMessage: vi.fn(),
  streamMessage: vi.fn(),
  publish: vi.fn(),
  revert: vi.fn(),
};

function controller() {
  return new PlanningSessionController({
    authService: { requireUser } as unknown as AuthService,
    planningSessionService: service as never,
  });
}

function post(path: string, body?: unknown, headers: HeadersInit = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers:
      body === undefined
        ? headers
        : { "Content-Type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}

// Minimal events. The stream only needs id, seq and type to frame them.
function event(seq: number, type: SessionEvent["type"], extra = {}) {
  return {
    id: `10:${seq}`,
    seq,
    conversationId: CID,
    type,
    ...extra,
  } as unknown as SessionEvent;
}

async function read(response: Response) {
  return response.text();
}

function parseFrames(text: string) {
  return text
    .split("\n\n")
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const lines = frame.split("\n");
      if (lines.length === 1 && lines[0].startsWith(":")) {
        return { comment: lines[0] };
      }
      const field = (name: string) =>
        lines
          .find((line) => line.startsWith(`${name}: `))
          ?.slice(name.length + 2);
      return {
        id: field("id"),
        event: field("event"),
        data: JSON.parse(field("data") ?? "null") as SessionEvent,
      };
    });
}

// A stand-in for streamMessage. `cleaned` records the service's finally block running.
function fakeStream(
  steps: Array<SessionEvent | Error | { wait: number }>,
  state: { cleaned: boolean } = { cleaned: false },
) {
  return {
    state,
    run: async function* (): AsyncGenerator<SessionEvent> {
      try {
        for (const step of steps) {
          if (step instanceof Error) throw step;
          if ("wait" in step) {
            await new Promise((resolve) => setTimeout(resolve, step.wait));
            continue;
          }
          yield step;
        }
      } finally {
        state.cleaned = true;
      }
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  requireUser.mockResolvedValue({ id: USER });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("authentication", () => {
  it("rejects anonymous requests before reading any body or touching the service", async () => {
    requireUser.mockRejectedValue(new ApiError(401, "Sign in to continue."));
    const request = post(`/api/planning/conversations/${CID}/messages`, {
      text: "hi",
    });
    const bodyRead = vi.spyOn(request, "json");
    const c = controller();
    const release = vi.fn();
    const calls = [
      c.list(),
      c.create(request),
      c.get(CID),
      c.send(request, CID),
      c.stream(request, CID, release),
      c.publish(request, CID),
      c.revert(request, CID),
      c.changes(CID),
      c.changeSource(CID, "1"),
      c.versions(CID),
      c.version(CID, "1"),
    ];
    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ status: 401 });
    }
    expect(bodyRead).not.toHaveBeenCalled();
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("same-origin check", () => {
  it("rejects a cross-origin POST on every write endpoint", async () => {
    const headers = { Origin: "https://evil.example" };
    const c = controller();
    const release = vi.fn();
    const calls = [
      c.create(post("/api/planning/conversations", {}, headers)),
      c.send(post("/x", { text: "hi" }, headers), CID),
      c.stream(post("/x", { text: "hi" }, headers), CID, release),
      c.publish(post("/x", {}, headers), CID),
      c.revert(post("/x", { toChangeId: "1" }, headers), CID),
    ];
    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ status: 403 });
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects Sec-Fetch-Site cross-site", async () => {
    await expect(
      controller().create(post("/x", {}, { "Sec-Fetch-Site": "cross-site" })),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("validation", () => {
  it.each(["not-a-uuid", "123", ""])(
    "returns 400 for the conversation id %j",
    async (id) => {
      await expect(controller().get(id)).rejects.toMatchObject({ status: 400 });
      await expect(controller().changes(id)).rejects.toMatchObject({
        status: 400,
      });
      expect(service.getConversation).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { text: "" },
    { text: "   " },
    { text: "x".repeat(8001) },
    { text: "hi", via: "fax" },
    { text: "hi", clientMessageId: "nope" },
  ])("returns 400 for an invalid message body (case %#)", async (body) => {
    await expect(
      controller().send(post("/x", body), CID),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      controller().stream(post("/x", body), CID, vi.fn()),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.sendMessage).not.toHaveBeenCalled();
    expect(service.streamMessage).not.toHaveBeenCalled();
  });

  it("requires a JSON content type and valid JSON for messages", async () => {
    const text = new Request(`${ORIGIN}/x`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });
    await expect(controller().send(text, CID)).rejects.toMatchObject({
      status: 415,
    });
    await expect(controller().send(post("/x", "{"), CID)).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it.each(["0", "abc", "1.5", "-1", "01", "1".repeat(12)])(
    "returns 400 for the version number %j",
    async (number) => {
      await expect(controller().version(CID, number)).rejects.toMatchObject({
        status: 400,
      });
      expect(service.getVersion).not.toHaveBeenCalled();
    },
  );

  it.each(["abc", "0", "-5", "9223372036854775808", "1.2"])(
    "returns 400 for the change id %j",
    async (changeId) => {
      await expect(
        controller().changeSource(CID, changeId),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        controller().revert(post("/x", { toChangeId: changeId }), CID),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        controller().publish(post("/x", { changeId }), CID),
      ).rejects.toMatchObject({ status: 400 });
      expect(service.getChangeSource).not.toHaveBeenCalled();
      expect(service.revert).not.toHaveBeenCalled();
      expect(service.publish).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for an empty project name", async () => {
    await expect(
      controller().create(post("/x", { projectName: "  " })),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("conversations", () => {
  it("lists and reads with no-store, for the signed-in user only", async () => {
    service.listConversations.mockResolvedValue([{ id: CID }]);
    service.getConversation.mockResolvedValue({ id: CID });
    const list = await controller().list();
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect(await list.json()).toEqual([{ id: CID }]);
    expect(service.listConversations).toHaveBeenCalledWith(USER);
    const detail = await controller().get(CID);
    expect(await detail.json()).toEqual({ id: CID });
    expect(service.getConversation).toHaveBeenCalledWith(USER, CID);
  });

  it("creates with 201, defaulting the project name and accepting an empty body", async () => {
    service.createConversation.mockResolvedValue({ id: CID });
    const empty = await controller().create(
      post("/api/planning/conversations"),
    );
    expect(empty.status).toBe(201);
    expect(service.createConversation).toHaveBeenLastCalledWith(USER, {
      projectName: "New conversation",
    });
    await controller().create(
      post("/api/planning/conversations", {
        projectName: "  Incident search ",
      }),
    );
    expect(service.createConversation).toHaveBeenLastCalledWith(USER, {
      projectName: "Incident search",
    });
  });

  it("never reads a user id from the request", async () => {
    service.createConversation.mockResolvedValue({ id: CID });
    await controller().create(
      post("/x", {
        projectName: "A",
        userId: "someone-else",
        organizationId: "o",
      }),
    );
    expect(service.createConversation).toHaveBeenCalledWith(USER, {
      projectName: "A",
    });
  });
});

describe("send", () => {
  it("parses the body, applies defaults, and returns the result", async () => {
    service.sendMessage.mockResolvedValue({ ok: true });
    const response = await controller().send(
      post("/x", { text: "  hello  " }, { Origin: ORIGIN }),
      CID,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(service.sendMessage).toHaveBeenCalledWith(USER, CID, {
      text: "hello",
      via: "text",
    });
  });

  it.each([
    ["config", 503],
    ["provider", 502],
    ["invalid-output", 502],
  ] as const)(
    "maps a %s model error to %i without leaking detail",
    async (kind, status) => {
      service.sendMessage.mockRejectedValue(
        new ModelError(kind, "key sk-or-123 and the system prompt"),
      );
      const error = (await controller()
        .send(post("/x", { text: "hi" }), CID)
        .catch((e: unknown) => e)) as ApiError;
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(status);
      expect(error.message).not.toMatch(/sk-or|prompt/);
      expect(console.error).toHaveBeenCalled();
    },
  );

  it("passes service 404 and 409 through, and unexpected errors for the generic 500", async () => {
    service.sendMessage.mockRejectedValueOnce(
      new ApiError(404, "Conversation not found."),
    );
    await expect(
      controller().send(post("/x", { text: "hi" }), CID),
    ).rejects.toMatchObject({ status: 404 });
    service.sendMessage.mockRejectedValueOnce(
      new ApiError(409, "A message is still being processed."),
    );
    await expect(
      controller().send(post("/x", { text: "hi" }), CID),
    ).rejects.toMatchObject({ status: 409 });
    const failure = new Error("private details");
    service.sendMessage.mockRejectedValueOnce(failure);
    await expect(
      controller().send(post("/x", { text: "hi" }), CID),
    ).rejects.toBe(failure);
  });
});

describe("publish, revert and history", () => {
  it("publishes as the signed-in user, defaulting to the working change", async () => {
    service.publish.mockResolvedValue({ number: 1, label: "v1" });
    const response = await controller().publish(post("/x"), CID);
    expect(response.status).toBe(201);
    expect(service.publish).toHaveBeenLastCalledWith(USER, CID, {});
    await controller().publish(post("/x", { changeId: "42" }), CID);
    expect(service.publish).toHaveBeenLastCalledWith(USER, CID, {
      changeId: "42",
    });
  });

  it("passes service conflicts from publish through as 409", async () => {
    service.publish.mockRejectedValue(new ApiError(409, "Already published."));
    await expect(controller().publish(post("/x"), CID)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("reverts to a change id", async () => {
    service.revert.mockResolvedValue({ change: { id: "9" } });
    const response = await controller().revert(
      post("/x", { toChangeId: "7" }),
      CID,
    );
    expect(response.status).toBe(201);
    expect(service.revert).toHaveBeenCalledWith(USER, CID, { toChangeId: "7" });
  });

  it("reads changes, change sources, and versions for the signed-in user", async () => {
    service.listChanges.mockResolvedValue([]);
    service.getChangeSource.mockResolvedValue({ changeId: "7" });
    service.listVersions.mockResolvedValue([]);
    service.getVersion.mockResolvedValue({ number: 2 });
    await controller().changes(CID);
    await controller().changeSource(CID, "7");
    await controller().versions(CID);
    await controller().version(CID, "2");
    expect(service.listChanges).toHaveBeenCalledWith(USER, CID);
    expect(service.getChangeSource).toHaveBeenCalledWith(USER, CID, "7");
    expect(service.listVersions).toHaveBeenCalledWith(USER, CID);
    expect(service.getVersion).toHaveBeenCalledWith(USER, CID, 2);
  });
});

describe("stream", () => {
  const body = { text: "hello", clientMessageId: undefined };

  it("returns a normal JSON status for a pre-flight 404 or 409", async () => {
    for (const status of [404, 409]) {
      const release = vi.fn();
      service.streamMessage.mockReturnValue(
        fakeStream([new ApiError(status, "no")]).run(),
      );
      await expect(
        controller().stream(post("/x", body), CID, release),
      ).rejects.toMatchObject({ status });
    }
  });

  it("frames events as SSE with increasing ids and the right headers", async () => {
    const release = vi.fn();
    const stream = fakeStream([
      event(1, "message.delta", { text: "Who " }),
      event(2, "message.delta", { text: "uses it?" }),
      event(3, "message.final", { phase: "grilling" }),
    ]);
    service.streamMessage.mockReturnValue(stream.run());
    const response = await controller().stream(post("/x", body), CID, release);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/event-stream/);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-transform",
    );
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");

    const text = await read(response);
    const frames = parseFrames(text);
    expect(frames.map((f) => ("event" in f ? f.event : "comment"))).toEqual([
      "message.delta",
      "message.delta",
      "message.final",
    ]);
    expect(frames.map((f) => ("id" in f ? f.id : null))).toEqual([
      "10:1",
      "10:2",
      "10:3",
    ]);
    for (const frame of frames) {
      if (frame.data) expect(frame.data.type).toBe(frame.event);
    }
    expect(text.endsWith("\n\n")).toBe(true);
    expect(stream.state.cleaned).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(service.streamMessage).toHaveBeenCalledWith(USER, CID, {
      text: "hello",
      via: "text",
    });
  });

  it("sends a heartbeat comment while the turn is quiet", async () => {
    const release = vi.fn();
    const stream = fakeStream([
      event(1, "message.delta", { text: "a" }),
      { wait: 80 },
      event(2, "message.final"),
    ]);
    const generator = stream.run();
    const first = generator.next();
    const text = await read(
      new Response(
        sessionEventStream({
          generator,
          first,
          conversationId: CID,
          heartbeatMs: 20,
          onClose: release,
        }),
      ),
    );
    expect(text).toContain(": heartbeat\n\n");
    expect(parseFrames(text).filter((f) => "event" in f)).toHaveLength(2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("stops and cleans up when the client aborts", async () => {
    const release = vi.fn();
    const abort = new AbortController();
    const stream = fakeStream([
      event(1, "message.delta", { text: "a" }),
      { wait: 30 },
      event(2, "message.delta", { text: "b" }),
      { wait: 30 },
      event(3, "message.delta", { text: "c" }),
      event(4, "message.final"),
    ]);
    service.streamMessage.mockReturnValue(stream.run());
    const request = new Request(`${ORIGIN}/x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    const response = await controller().stream(request, CID, release);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("message.delta");
    abort.abort();
    const rest: string[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest.push(new TextDecoder().decode(chunk.value));
    }
    expect(rest.join("")).not.toContain("message.final");
    expect(stream.state.cleaned).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("stops and cleans up when the reader cancels", async () => {
    const release = vi.fn();
    const stream = fakeStream([
      event(1, "message.delta", { text: "a" }),
      { wait: 20 },
      event(2, "message.delta", { text: "b" }),
      event(3, "message.final"),
    ]);
    service.streamMessage.mockReturnValue(stream.run());
    const response = await controller().stream(post("/x", body), CID, release);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(stream.state.cleaned).toBe(true);
  });

  it("emits an error event with generic text, then closes, on a mid-stream failure", async () => {
    const release = vi.fn();
    service.streamMessage.mockReturnValue(
      fakeStream([
        event(1, "message.delta", { text: "a" }),
        new ModelError("provider", "key sk-or-123 and the prompt text"),
      ]).run(),
    );
    const response = await controller().stream(post("/x", body), CID, release);
    const text = await read(response);
    const frames = parseFrames(text);
    expect(frames.map((f) => ("event" in f ? f.event : "comment"))).toEqual([
      "message.delta",
      "error",
    ]);
    const error = frames[1] as { data: SessionEvent & { type: "error" } };
    expect(error.data.code).toBe("agent_failed");
    expect(error.data.seq).toBe(2);
    expect(text).not.toMatch(/sk-or|prompt/);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("turns a rejection after the pre-flight window into an error event", async () => {
    const release = vi.fn();
    service.streamMessage.mockReturnValue(
      fakeStream([{ wait: 60 }, new ApiError(409, "busy")]).run(),
    );
    const response = await controller().stream(post("/x", body), CID, release, {
      preflightMs: 10,
    });
    expect(response.status).toBe(200);
    const frames = parseFrames(await read(response));
    expect(frames).toHaveLength(1);
    expect((frames[0] as { data: { code: string } }).data.code).toBe(
      "conflict",
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not wait for the whole turn before sending headers", async () => {
    const release = vi.fn();
    service.streamMessage.mockReturnValue(
      fakeStream([{ wait: 80 }, event(1, "message.final")]).run(),
    );
    const started = Date.now();
    const response = await controller().stream(post("/x", body), CID, release, {
      preflightMs: 10,
    });
    expect(Date.now() - started).toBeLessThan(60);
    await read(response);
  });
});

describe("sse helpers", () => {
  it("formats one event per frame with a single data line", () => {
    const text = formatEvent(event(1, "message.delta", { text: "a\nb" }));
    expect(text.split("\n").filter((l) => l.startsWith("data: "))).toHaveLength(
      1,
    );
    expect(text).toMatch(/^id: 10:1\nevent: message.delta\ndata: \{.*\}\n\n$/);
  });

  it("maps errors to generic event codes", () => {
    expect(toErrorEvent(new ApiError(404, "x"), CID, 1).code).toBe("not_found");
    expect(toErrorEvent(new ApiError(409, "x"), CID, 1).code).toBe("conflict");
    expect(
      toErrorEvent(new ModelError("invalid-output", "bad"), CID, 1).code,
    ).toBe("invalid_output");
    expect(toErrorEvent(new Error("db password"), CID, 1)).toMatchObject({
      code: "internal",
      message: "Something went wrong.",
    });
  });
});
