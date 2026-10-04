import { asValue, type AwilixContainer } from "awilix";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getChangeSource } from "@/app/api/planning/conversations/[id]/changes/[changeId]/source/route";
import { GET as getChanges } from "@/app/api/planning/conversations/[id]/changes/route";
import { POST as postMessage } from "@/app/api/planning/conversations/[id]/messages/route";
import { POST as postStream } from "@/app/api/planning/conversations/[id]/messages/stream/route";
import { POST as postPublish } from "@/app/api/planning/conversations/[id]/publish/route";
import { POST as postRevert } from "@/app/api/planning/conversations/[id]/revert/route";
import { GET as getConversation } from "@/app/api/planning/conversations/[id]/route";
import { GET as getVersion } from "@/app/api/planning/conversations/[id]/versions/[number]/route";
import { GET as getVersions } from "@/app/api/planning/conversations/[id]/versions/route";
import {
  GET as listConversations,
  POST as createConversation,
} from "@/app/api/planning/conversations/route";
import { POST as synthesize } from "@/app/api/planning/speech/synthesize/route";
import { POST as transcribe } from "@/app/api/planning/speech/transcribe/route";
import type { AuthService } from "@/features/auth/server/auth.service";
import { FakeSpeech } from "@/features/planning/server/fake.speech";
import { PlanningController } from "@/features/planning/server/planning.controller";
import { PlanningSessionController } from "@/features/planning/server/planning-session.controller";
import type { SessionEvent } from "@/features/planning/session-contracts";
import { container } from "@/server/container";
import { ApiError } from "@/server/errors";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

const CID = "6f1e8c3a-2b7d-4e55-9a3c-0d4f5a6b7c8d";
const requireUser = vi.fn();
const streamMessage = vi.fn();
const sendMessage = vi.fn();
const params = <T extends object>(value: T) => ({
  params: Promise.resolve(value),
});

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, init);
}

function jsonPost(path: string, body: unknown) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The controller registrations are added to container.ts by the team. Register stubs here.
function registerControllers() {
  const authService = { requireUser } as unknown as AuthService;
  (container as unknown as AwilixContainer).register({
    planningController: asValue(
      new PlanningController({ authService, speech: new FakeSpeech("hello") }),
    ),
    planningSessionController: asValue(
      new PlanningSessionController({
        authService,
        planningSessionService: {
          sendMessage,
          streamMessage,
        } as never,
      }),
    ),
  });
}

describe("planning API through the request-scoped DI container", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    requireUser.mockResolvedValue({ id: "user-a" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    registerControllers();
  });

  it("returns 401 JSON for every endpoint when anonymous", async () => {
    requireUser.mockRejectedValue(new ApiError(401, "Sign in to continue."));
    const id = params({ id: CID });
    const responses = await Promise.all([
      listConversations(),
      createConversation(jsonPost("/api/planning/conversations", {})),
      getConversation(request("/x"), id),
      postMessage(jsonPost("/x", { text: "hi" }), id),
      postStream(jsonPost("/x", { text: "hi" }), id),
      postPublish(jsonPost("/x", {}), id),
      postRevert(jsonPost("/x", { toChangeId: "1" }), id),
      getChanges(request("/x"), id),
      getChangeSource(request("/x"), params({ id: CID, changeId: "1" })),
      getVersions(request("/x"), id),
      getVersion(request("/x"), params({ id: CID, number: "1" })),
      synthesize(jsonPost("/api/planning/speech/synthesize", { text: "x" })),
      transcribe(jsonPost("/api/planning/speech/transcribe", {})),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Sign in to continue." });
    }
    expect(sendMessage).not.toHaveBeenCalled();
    expect(streamMessage).not.toHaveBeenCalled();
  });

  it("returns 400 JSON for an invalid id and a generic 500 for unexpected failures", async () => {
    expect(
      (await getConversation(request("/x"), params({ id: "nope" }))).status,
    ).toBe(400);
    sendMessage.mockRejectedValue(new Error("private details"));
    const response = await postMessage(
      jsonPost("/x", { text: "hi" }),
      params({ id: CID }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error." });
  });

  it("streams synthesized audio through the route", async () => {
    const response = await synthesize(
      jsonPost("/api/planning/speech/synthesize", { text: "reply" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("reply");
  });

  it("keeps the request scope open until the event stream ends", async () => {
    const disposals: Array<ReturnType<typeof vi.fn>> = [];
    const createScope = container.createScope.bind(container);
    vi.spyOn(container, "createScope").mockImplementation(() => {
      const scope = createScope();
      const dispose = vi.fn(scope.dispose.bind(scope));
      scope.dispose = dispose;
      disposals.push(dispose);
      return scope;
    });
    streamMessage.mockImplementation(
      async function* (): AsyncGenerator<SessionEvent> {
        yield {
          type: "message.delta",
          id: "1:1",
          seq: 1,
          conversationId: CID,
          text: "hi",
        };
        await new Promise((resolve) => setTimeout(resolve, 20));
        yield {
          type: "message.delta",
          id: "1:2",
          seq: 2,
          conversationId: CID,
          text: "!",
        };
      },
    );
    const response = await postStream(
      jsonPost(`/api/planning/conversations/${CID}/messages/stream`, {
        text: "hello",
      }),
      params({ id: CID }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    // The handler has returned, but the scope must stay open while the body streams.
    expect(disposals).toHaveLength(1);
    expect(disposals[0]).not.toHaveBeenCalled();
    const text = await response.text();
    expect(text).toContain("event: message.delta");
    await vi.waitFor(() => expect(disposals[0]).toHaveBeenCalledTimes(1));
  });

  it("disposes the scope and returns JSON when the stream cannot start", async () => {
    const disposals: Array<ReturnType<typeof vi.fn>> = [];
    const createScope = container.createScope.bind(container);
    vi.spyOn(container, "createScope").mockImplementation(() => {
      const scope = createScope();
      const dispose = vi.fn(scope.dispose.bind(scope));
      scope.dispose = dispose;
      disposals.push(dispose);
      return scope;
    });
    streamMessage.mockImplementation(
      async function* (): AsyncGenerator<SessionEvent> {
        throw new ApiError(404, "Conversation not found.");
      },
    );
    const response = await postStream(
      jsonPost(`/api/planning/conversations/${CID}/messages/stream`, {
        text: "hello",
      }),
      params({ id: CID }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Conversation not found." });
    expect(disposals[0]).toHaveBeenCalledTimes(1);
  });
});
