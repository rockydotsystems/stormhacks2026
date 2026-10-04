import "server-only";
import { NextResponse } from "next/server";
import { linearSyncRequestSchema } from "@stormhacks/data/linear/contracts";
import { organizationIdSchema } from "@/features/organizations/contracts";
import { appOrigin } from "@/features/github/server/config";
import { readLimitedBody } from "@/features/github/server/security";
import type { Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";
import { connectLinearSchema } from "../contracts";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new ApiError(403, "Use this application to manage Linear.");
}
function organizationId(request: Request) {
  const parsed = organizationIdSchema.safeParse(
    new URL(request.url).searchParams.get("organizationId"),
  );
  if (!parsed.success) throw new ApiError(400, "Choose an organization.");
  return parsed.data;
}
async function readJson(request: Request): Promise<unknown> {
  requireOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new ApiError(415, "Content-Type must be application/json.");
  try {
    return JSON.parse(
      (await readLimitedBody(request, 4096)).toString("utf8"),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

export class LinearController {
  constructor(
    private readonly dependencies: {
      authService: Pick<Dependencies["authService"], "requireUser">;
      linearService: Pick<
        Dependencies["linearService"],
        | "status"
        | "connect"
        | "disconnect"
        | "teams"
        | "documentStatus"
        | "sync"
      >;
    },
  ) {}

  async status(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    return json(
      await this.dependencies.linearService.status({
        userId: user.id,
        organizationId: organizationId(request),
      }),
    );
  }

  async connect(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const input = connectLinearSchema.safeParse(await readJson(request));
    if (!input.success) throw new ApiError(400, "Choose an organization.");
    await this.dependencies.linearService.connect({
      userId: user.id,
      organizationId: input.data.organizationId,
    });
    return json({ connected: true });
  }

  async disconnect(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const input = connectLinearSchema.safeParse(await readJson(request));
    if (!input.success) throw new ApiError(400, "Choose an organization.");
    await this.dependencies.linearService.disconnect({
      userId: user.id,
      organizationId: input.data.organizationId,
    });
    return json({ disconnected: true });
  }

  async teams(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    return json({
      teams: await this.dependencies.linearService.teams({
        userId: user.id,
        organizationId: organizationId(request),
      }),
    });
  }

  async documentStatus(request: Request, docId: string) {
    const user = await this.dependencies.authService.requireUser();
    return json(
      await this.dependencies.linearService.documentStatus(
        { userId: user.id, organizationId: organizationId(request) },
        docId,
      ),
    );
  }

  async sync(request: Request, docId: string) {
    const user = await this.dependencies.authService.requireUser();
    const body = (await readJson(request)) as { organizationId?: unknown };
    const organization = organizationIdSchema.safeParse(body?.organizationId);
    const input = linearSyncRequestSchema.safeParse(body);
    if (!organization.success || !input.success)
      throw new ApiError(
        400,
        "Choose an organization and a valid Linear team.",
      );
    return json(
      await this.dependencies.linearService.sync(
        { userId: user.id, organizationId: organization.data },
        docId,
        input.data,
      ),
    );
  }
}
