import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthService } from "@/features/auth/server/auth.service";
import { ModelError } from "@/features/planning/server/model";
import {
  SpeechError,
  type SpeechPort,
} from "@/features/planning/server/speech";
import { ApiError } from "@/server/errors";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const synthesizeSchema = z.object({ text: z.string().trim().min(1).max(4000) });

// Speech endpoints only. The conversation API lives in PlanningSessionController.
export class PlanningController {
  constructor(
    private readonly dependencies: {
      authService: AuthService;
      speech: SpeechPort;
    },
  ) {}

  async transcribe(request: Request) {
    await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "multipart/form-data"
    ) {
      throw new ApiError(415, "Content-Type must be multipart/form-data.");
    }
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + 1024) {
      throw new ApiError(413, "Audio must be 10 MB or smaller.");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Request body must be valid form data.");
    }
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw new ApiError(400, "An audio file is required.");
    }
    if (!audio.type.startsWith("audio/")) {
      throw new ApiError(400, "The file must be audio.");
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new ApiError(413, "Audio must be 10 MB or smaller.");
    }
    try {
      const { text } = await this.dependencies.speech.transcribe({
        audio,
        signal: request.signal,
      });
      return NextResponse.json(
        { text },
        {
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async synthesize(request: Request) {
    await this.dependencies.authService.requireUser();
    assertSameOrigin(request);
    const input = synthesizeSchema.safeParse(await readJson(request));
    if (!input.success) {
      throw new ApiError(400, "Text must contain 1 to 4000 characters.");
    }
    try {
      const { audio, contentType } = await this.dependencies.speech.synthesize({
        text: input.data.text,
        signal: request.signal,
      });
      return new Response(audio, {
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    } catch (error) {
      throw mapProviderError(error);
    }
  }
}

/**
 * Cookie-authenticated writes must come from this origin. A present Origin header has to match
 * the request origin. Browsers that send Sec-Fetch-Site must not report a cross-site request.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "Cross-origin requests are not allowed.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Cross-origin requests are not allowed.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    throw new ApiError(415, "Content-Type must be application/json.");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

// Provider detail stays in the server log. The client sees a generic message.
export function mapProviderError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof ModelError || error instanceof SpeechError) {
    console.error("Planning provider call failed", error);
    return error.kind === "config"
      ? new ApiError(503, "Planning is not configured.")
      : new ApiError(502, "The planning provider failed. Try again.");
  }
  return error;
}
