import "server-only";
import { z } from "zod";
import { askChatSchema, chatScopeSchema, createChatSchema } from "../contracts";
import type { Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";
import { assertSameOrigin } from "@/features/planning/server/planning.controller";

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new ApiError(415, "Content-Type must be application/json.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    throw new ApiError(
      400,
      parsed.error.issues[0]?.message || "Invalid input.",
    );
  return parsed.data;
}
function scope(request: Request) {
  const parsed = chatScopeSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    throw new ApiError(400, "Use valid organization and project IDs.");
  return parsed.data;
}
function chatId(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new ApiError(400, "Use a valid chat ID.");
  return id;
}
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export class ProjectChatController {
  constructor(
    private readonly dependencies: Pick<
      Dependencies,
      "authService" | "projectChatService"
    >,
  ) {}
  async list(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const input = scope(request);
    return json(
      await this.dependencies.projectChatService.list(
        { userId: user.id, organizationId: input.organizationId },
        input.projectId,
      ),
    );
  }
  async create(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const input = await body(request, createChatSchema);
    return json(
      await this.dependencies.projectChatService.create(
        { userId: user.id, organizationId: input.organizationId },
        input.projectId,
        input.title,
      ),
      201,
    );
  }
  async get(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    const input = scope(request);
    return json(
      await this.dependencies.projectChatService.get(
        { userId: user.id, organizationId: input.organizationId },
        input.projectId,
        chatId(id),
      ),
    );
  }
  async ask(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const input = await body(request, askChatSchema);
    return json(
      await this.dependencies.projectChatService.ask(
        { userId: user.id, organizationId: input.organizationId },
        input.projectId,
        chatId(id),
        input,
        request.signal,
      ),
    );
  }
}
