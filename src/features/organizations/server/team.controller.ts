import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "@/server/errors";
import type { Dependencies } from "@/server/container";
import { organizationIdSchema, teamActionSchema } from "../contracts";

const json = (data: unknown) =>
  NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });

export class TeamController {
  constructor(
    private readonly dependencies: Pick<
      Dependencies,
      "authService" | "teamService"
    >,
  ) {}

  async list(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const parsed = organizationIdSchema.safeParse(
      new URL(request.url).searchParams.get("organizationId"),
    );
    if (!parsed.success)
      throw new ApiError(400, "Choose a WorkOS organization.");
    return json(
      await this.dependencies.teamService.list({
        organizationId: parsed.data,
        userId: user.id,
      }),
    );
  }

  async act(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      throw new ApiError(415, "Content-Type must be application/json.");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Request body must be valid JSON.");
    }
    const parsed = teamActionSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(400, "Use a valid team action, email, and WorkOS ID.");
    const { organizationId, ...action } = parsed.data;
    await this.dependencies.teamService.act(
      { organizationId, userId: user.id },
      action,
    );
    return json({ ok: true });
  }
}
