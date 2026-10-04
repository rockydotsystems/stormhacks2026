import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthService } from "@/features/auth/server/auth.service";
import { changeIdSchema } from "@/features/docs/contracts";
import {
  assertSameOrigin,
  mapProviderError,
  readJson,
} from "@/features/planning/server/planning.controller";
import type { PlanningSessionService } from "@/features/planning/server/planning-session.service";
import {
  SSE_HEADERS,
  sessionEventStream,
} from "@/features/planning/server/sse";
import {
  createConversationSchema,
  publishSchema,
  revertSchema,
  sendMessageSchema,
} from "@/features/planning/session-contracts";
import { ApiError } from "@/server/errors";

// How long the stream route waits for the service to reject (404, 409) before it commits to a
// 200 event stream. A failure inside this window is a normal JSON error status. A later one
// arrives as an `error` event.
export const PREFLIGHT_WINDOW_MS = 2000;

const DEFAULT_PROJECT_NAME = "New conversation";

const conversationIdSchema = z.string().uuid();
const versionNumberSchema = z.string().regex(/^[1-9][0-9]{0,8}$/);

// Structural type, so tests can pass a stub without building the whole service.
type SessionService = Pick<
  PlanningSessionService,
  | "createConversation"
  | "listConversations"
  | "getConversation"
  | "liveAccess"
  | "listChanges"
  | "listVersions"
  | "getVersion"
  | "getChangeSource"
  | "getVersionSource"
  | "sendMessage"
  | "streamMessage"
  | "publish"
  | "revert"
>;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export class PlanningSessionController {
  constructor(
    private readonly dependencies: {
      authService: AuthService;
      planningSessionService: SessionService;
    },
  ) {}

  private get service() {
    return this.dependencies.planningSessionService;
  }

  async list() {
    const user = await this.dependencies.authService.requireUser();
    return json(await this.service.listConversations(user.id));
  }

  async create(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const raw = await readOptionalJson(request);
    const fields: Record<string, unknown> =
      raw && typeof raw === "object" ? { ...raw } : {};
    // An organization only means something next to the document it holds.
    if (!fields.documentId) delete fields.organizationId;
    if (typeof fields.projectName !== "string") {
      fields.projectName = DEFAULT_PROJECT_NAME;
    }
    const body = createConversationSchema.safeParse(fields);
    if (!body.success) throw new ApiError(400, "Conversation is invalid.");
    const detail = await this.service.createConversation(user.id, body.data);
    return json(detail, 201);
  }

  async get(id: string) {
    const user = await this.dependencies.authService.requireUser();
    return json(
      await this.service.getConversation(user.id, conversationId(id)),
    );
  }

  // For the realtime Worker only. It forwards the caller's cookie to learn who they are and
  // whether they may join this conversation's live room.
  async liveAccess(id: string) {
    const user = await this.dependencies.authService.requireUser();
    return json(await this.service.liveAccess(user.id, conversationId(id)));
  }

  async send(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const conversation = conversationId(id);
    const input = sendMessageSchema.safeParse(await readJson(request));
    if (!input.success) throw new ApiError(400, "Message is invalid.");
    try {
      return json(
        await this.service.sendMessage(user.id, conversation, input.data),
      );
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  /**
   * Streams one turn as Server-Sent Events. `release` disposes the request scope and must run
   * when the stream ends, because the scope has to outlive the handler. See handleApiStream.
   */
  async stream(
    request: Request,
    id: string,
    release: () => Promise<void>,
    options: { preflightMs?: number } = {},
  ) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const conversation = conversationId(id);
    const input = sendMessageSchema.safeParse(await readJson(request));
    if (!input.success) throw new ApiError(400, "Message is invalid.");

    const generator = this.service.streamMessage(
      user.id,
      conversation,
      input.data,
    );
    // Starting the generator runs the service's checks (ownership, busy lease). Wait briefly for
    // them, so a 404 or 409 is a real HTTP status and not an event inside a 200 response.
    const first = generator.next();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const early = await Promise.race([
      first.then(
        () => ({ kind: "started" as const }),
        (error: unknown) => ({ kind: "failed" as const, error }),
      ),
      new Promise<{ kind: "pending" }>((resolve) => {
        timer = setTimeout(
          () => resolve({ kind: "pending" }),
          options.preflightMs ?? PREFLIGHT_WINDOW_MS,
        );
      }),
    ]);
    clearTimeout(timer);
    if (early.kind === "failed") throw mapProviderError(early.error);

    return new Response(
      sessionEventStream({
        generator,
        first,
        conversationId: conversation,
        signal: request.signal,
        onClose: release,
      }),
      { headers: SSE_HEADERS },
    );
  }

  // Human action. There is no agent path to this method.
  async publish(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const conversation = conversationId(id);
    const input = publishSchema.safeParse(await readOptionalJson(request));
    if (!input.success) throw new ApiError(400, "Change id is invalid.");
    return json(
      await this.service.publish(user.id, conversation, input.data),
      201,
    );
  }

  async revert(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const conversation = conversationId(id);
    const input = revertSchema.safeParse(await readJson(request));
    if (!input.success) throw new ApiError(400, "Change id is invalid.");
    return json(
      await this.service.revert(user.id, conversation, input.data),
      201,
    );
  }

  async changes(id: string) {
    const user = await this.dependencies.authService.requireUser();
    return json(await this.service.listChanges(user.id, conversationId(id)));
  }

  async changeSource(id: string, changeId: string) {
    const user = await this.dependencies.authService.requireUser();
    const conversation = conversationId(id);
    const change = changeIdSchema.safeParse(changeId);
    if (!change.success) throw new ApiError(400, "Change id is invalid.");
    return json(
      await this.service.getChangeSource(user.id, conversation, change.data),
    );
  }

  async versions(id: string) {
    const user = await this.dependencies.authService.requireUser();
    return json(await this.service.listVersions(user.id, conversationId(id)));
  }

  // `number` is a version number, or "draft" for the changes after the latest version.
  async versionSource(id: string, number: string) {
    const user = await this.dependencies.authService.requireUser();
    const conversation = conversationId(id);
    if (number !== "draft" && !versionNumberSchema.safeParse(number).success) {
      throw new ApiError(400, "Version number is invalid.");
    }
    return json(
      await this.service.getVersionSource(
        user.id,
        conversation,
        number === "draft" ? null : Number(number),
      ),
    );
  }

  async version(id: string, number: string) {
    const user = await this.dependencies.authService.requireUser();
    const conversation = conversationId(id);
    if (!versionNumberSchema.safeParse(number).success) {
      throw new ApiError(400, "Version number is invalid.");
    }
    return json(
      await this.service.getVersion(user.id, conversation, Number(number)),
    );
  }
}

function conversationId(id: string): string {
  const parsed = conversationIdSchema.safeParse(id);
  if (!parsed.success) throw new ApiError(400, "Conversation id is invalid.");
  return parsed.data;
}

// For bodies that may be empty, such as publish with no change id. An empty body means `{}`.
// Anything else must be JSON, as readJson requires.
async function readOptionalJson(request: Request): Promise<unknown> {
  if (request.body === null) return {};
  return readJson(request);
}
