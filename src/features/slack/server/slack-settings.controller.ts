import { NextResponse } from "next/server";
import { z } from "zod";
import type { Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";
import { readLimitedBody } from "@/features/github/server/security";
import { organizationIdSchema } from "@/features/organizations/contracts";
import { slackOrigin } from "./config";
import { SlackSettingsService } from "./slack-settings.service";

const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify") }),
  z.object({
    action: z.literal("linkUser"),
    slackUserId: z.string().regex(/^U[A-Z0-9]+$/),
  }),
  z.object({
    action: z.literal("bind"),
    channelId: z.string().regex(/^[CG][A-Z0-9]+$/),
    projectId: z.uuid(),
    confirmSharing: z.literal(true),
  }),
  z.object({
    action: z.literal("unbind"),
    channelId: z.string().regex(/^[CG][A-Z0-9]+$/),
  }),
  z.object({ action: z.literal("disconnect") }),
]);

function organization(value: unknown) {
  const result = organizationIdSchema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Choose an organization.");
  return result.data;
}

export class SlackSettingsController {
  constructor(
    private readonly dependencies: {
      db: Dependencies["db"];
      authService: Pick<Dependencies["authService"], "requireUser">;
      projectsService: Pick<Dependencies["projectsService"], "list">;
    },
  ) {}

  private service() {
    return new SlackSettingsService(this.dependencies);
  }

  async status(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const organizationId = organization(
      new URL(request.url).searchParams.get("organizationId"),
    );
    const actor = { userId: user.id, organizationId };
    return NextResponse.json(
      {
        ...(await this.service().status(actor)),
        projects: await this.dependencies.projectsService.list(actor),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  async connect(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    if (request.headers.get("origin") !== slackOrigin())
      throw new ApiError(403, "Use this application's Slack settings.");
    if (
      request.headers.get("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
    )
      throw new ApiError(415, "Submit the Slack connection form.");
    const form = new URLSearchParams(
      (await readLimitedBody(request, 4096)).toString("utf8"),
    );
    const organizationId = organization(form.get("organizationId"));
    const url = await this.service().connect({
      userId: user.id,
      organizationId,
    });
    return NextResponse.redirect(url, {
      status: 303,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  async act(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    if (request.headers.get("origin") !== slackOrigin())
      throw new ApiError(403, "Use this application's Slack settings.");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new ApiError(415, "Submit Slack settings as JSON.");
    let data: unknown;
    try {
      data = JSON.parse(
        (await readLimitedBody(request, 4096)).toString("utf8"),
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "Submit a valid Slack settings action.");
    }
    const envelope = z
      .object({ organizationId: organizationIdSchema })
      .safeParse(data);
    const parsed = actions.safeParse(data);
    if (!envelope.success || !parsed.success)
      throw new ApiError(
        400,
        "Choose a valid Slack settings action and confirm channel sharing.",
      );
    const { organizationId } = envelope.data;
    const action = parsed.data;
    const actor = { userId: user.id, organizationId };
    const service = this.service();
    if (action.action === "verify") await service.verify(actor);
    if (action.action === "linkUser")
      await service.linkUser(actor, action.slackUserId);
    if (action.action === "bind")
      await service.bind(actor, action.channelId, action.projectId);
    if (action.action === "unbind")
      await service.unbind(actor, action.channelId);
    if (action.action === "disconnect") await service.disconnect(actor);
    return NextResponse.json({ ok: true });
  }
}
