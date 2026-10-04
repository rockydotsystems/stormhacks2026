import { organizationIdSchema } from "@/features/organizations/contracts";
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectGitHubSchema } from "../contracts";
import { appOrigin, getGitHubConfig } from "./config";
import { readLimitedBody, verifySignature } from "./security";
import { supportedEvents, webhookSchema } from "./github.service";
import type { Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";

const cookieName = "github_oauth_state";
const selectionCookie = "github_installation_selection";
function readSelection(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${selectionCookie}=`))
    ?.slice(selectionCookie.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new ApiError(
      403,
      "Use this application's GitHub settings to continue.",
    );
}
function cookie(response: NextResponse, value: string, name = cookieName) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: appOrigin().startsWith("https:"),
    sameSite: "lax",
    path: "/api/github",
    maxAge: value ? 600 : 0,
  });
}
function settingsRedirect(outcome: string, organizationId?: string) {
  const url = new URL("/settings/github", appOrigin());
  url.searchParams.set("github", outcome);
  if (organizationId) url.searchParams.set("organizationId", organizationId);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  cookie(response, "");
  return response;
}

export class GitHubController {
  constructor(
    private readonly dependencies: {
      authService: Pick<Dependencies["authService"], "requireUser">;
      githubService: Pick<
        Dependencies["githubService"],
        | "begin"
        | "complete"
        | "consumeState"
        | "status"
        | "sync"
        | "webhook"
        | "choices"
        | "select"
      >;
    },
  ) {}

  async status(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const organizationId = organizationIdSchema.safeParse(
      new URL(request.url).searchParams.get("organizationId"),
    );
    if (!organizationId.success)
      throw new ApiError(400, "Choose an organization.");
    return json(
      await this.dependencies.githubService.status({
        userId: user.id,
        organizationId: organizationId.data,
      }),
    );
  }

  async connect(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    requireOrigin(request);
    if (
      request.headers.get("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
    )
      throw new ApiError(415, "Submit the GitHub connection form.");
    const form = new URLSearchParams(
      (await readLimitedBody(request, 4096)).toString("utf8"),
    );
    const parsed = connectGitHubSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      throw new ApiError(400, parsed.error.issues[0].message);
    const { state, url } = await this.dependencies.githubService.begin({
      userId: user.id,
      organizationId: parsed.data.organizationId,
    });
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    cookie(response, state);
    cookie(response, "", selectionCookie);
    return response;
  }

  async callback(request: Request) {
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    const stored = request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || stored !== state)
      return settingsRedirect("restart");
    const user = await this.dependencies.authService.requireUser();
    const code = params.get("code");
    try {
      if (params.has("error")) {
        await this.dependencies.githubService.consumeState(user.id, state);
        return settingsRedirect("denied");
      }
      if (!code || code.length > 512) return settingsRedirect("restart");
      const { organizationId, selection } =
        await this.dependencies.githubService.complete(user.id, state, code);
      const response = settingsRedirect("choose", organizationId);
      cookie(response, selection, selectionCookie);
      return response;
    } catch (error) {
      if (error instanceof ApiError)
        return settingsRedirect(
          error.status === 409
            ? "conflict"
            : error.status === 403
              ? "access"
              : "failed",
        );
      throw error;
    }
  }

  async installations(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const organizationId = organizationIdSchema.safeParse(
      new URL(request.url).searchParams.get("organizationId"),
    );
    if (!organizationId.success)
      throw new ApiError(400, "Choose an organization.");
    const selection = readSelection(request);
    if (!selection) return json({ installations: [], authorized: false });
    const choices = await this.dependencies.githubService.choices(
      { userId: user.id, organizationId: organizationId.data },
      selection,
    );
    return json({ ...choices, authorized: true });
  }

  async select(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    requireOrigin(request);
    if (
      request.headers.get("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
    )
      throw new ApiError(415, "Submit the GitHub installation form.");
    const form = new URLSearchParams(
      (await readLimitedBody(request, 4096)).toString("utf8"),
    );
    const parsed = z
      .object({
        organizationId: organizationIdSchema,
        installationId: z
          .string()
          .regex(/^[1-9][0-9]*$/)
          .max(20),
      })
      .safeParse(Object.fromEntries(form));
    if (!parsed.success)
      throw new ApiError(400, "Choose a GitHub installation.");
    const selection = readSelection(request);
    if (!selection) return settingsRedirect("restart");
    try {
      await this.dependencies.githubService.select(
        { userId: user.id, organizationId: parsed.data.organizationId },
        selection,
        parsed.data.installationId,
      );
      const response = settingsRedirect(
        "connected",
        parsed.data.organizationId,
      );
      cookie(response, "", selectionCookie);
      return response;
    } catch (error) {
      if (error instanceof ApiError)
        return settingsRedirect(
          error.status === 409
            ? "conflict"
            : error.status === 403
              ? "access"
              : "failed",
          parsed.data.organizationId,
        );
      throw error;
    }
  }

  async sync(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    requireOrigin(request);
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new ApiError(415, "Content-Type must be application/json.");
    let body: unknown;
    const bytes = await readLimitedBody(request, 4096);
    try {
      body = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new ApiError(400, "Request body must be valid JSON.");
    }
    const input = z
      .object({
        organizationId: organizationIdSchema,
        installationId: z
          .string()
          .regex(/^[1-9][0-9]*$/)
          .max(20),
      })
      .safeParse(body);
    if (!input.success)
      throw new ApiError(400, "Choose a valid GitHub connection.");
    await this.dependencies.githubService.sync(
      { userId: user.id, organizationId: input.data.organizationId },
      input.data.installationId,
    );
    return json({ synced: true });
  }

  async webhook(request: Request) {
    const secret = getGitHubConfig().webhookSecret;
    const body = await readLimitedBody(request);
    verifySignature(body, request.headers.get("x-hub-signature-256"), secret);
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new ApiError(415, "Content-Type must be application/json.");
    const event = request.headers.get("x-github-event");
    const delivery = z
      .uuid()
      .safeParse(request.headers.get("x-github-delivery"));
    if (!event || !delivery.success)
      throw new ApiError(400, "GitHub delivery headers are required.");
    let value: unknown;
    try {
      value = JSON.parse(body.toString("utf8"));
    } catch {
      throw new ApiError(400, "Webhook body must be valid JSON.");
    }
    if (event === "ping" || !supportedEvents.has(event))
      return json({ accepted: true }, 202);
    const payload = webhookSchema.safeParse(value);
    if (!payload.success)
      throw new ApiError(400, "Invalid GitHub webhook payload.");
    await this.dependencies.githubService.webhook(
      delivery.data,
      event,
      payload.data,
    );
    return json({ accepted: true }, 202);
  }
}
