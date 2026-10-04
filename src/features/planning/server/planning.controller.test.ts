import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "@/features/auth/server/auth.service";
import {
  assertSameOrigin,
  MAX_AUDIO_BYTES,
  PlanningController,
} from "@/features/planning/server/planning.controller";
import { FakeSpeech } from "@/features/planning/server/fake.speech";
import { SpeechError } from "@/features/planning/server/speech";
import { ApiError } from "@/server/errors";

// Speech endpoints. The conversation API is covered by planning-session.controller.test.ts.

const ORIGIN = "http://localhost:3000";
const requireUser = vi.fn();
let speech: FakeSpeech;

function controller() {
  return new PlanningController({
    authService: { requireUser } as unknown as AuthService,
    speech,
  });
}

function json(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function audioForm(file: Blob | string | null) {
  const form = new FormData();
  if (typeof file === "string") form.set("audio", file);
  else if (file !== null) form.set("audio", file, "clip.webm");
  return new Request(`${ORIGIN}/api/planning/speech/transcribe`, {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  speech = new FakeSpeech("spoken words");
  requireUser.mockResolvedValue({ id: "user-a" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("authentication and origin", () => {
  it("rejects anonymous requests before reading the body or calling a provider", async () => {
    requireUser.mockRejectedValue(new ApiError(401, "Sign in to continue."));
    const request = json("/api/planning/speech/synthesize", { text: "hi" });
    const json_ = vi.spyOn(request, "json");
    const form = vi.spyOn(request, "formData");
    const c = controller();
    for (const call of [c.transcribe(request), c.synthesize(request)]) {
      await expect(call).rejects.toMatchObject({ status: 401 });
    }
    expect(json_).not.toHaveBeenCalled();
    expect(form).not.toHaveBeenCalled();
    expect(speech.synthesized).toHaveLength(0);
  });

  it("blocks a mismatched Origin header and a cross-site fetch", async () => {
    const body = { text: "hi" };
    await expect(
      controller().synthesize(
        json("/api/planning/speech/synthesize", body, {
          Origin: "https://evil.example",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      controller().synthesize(
        json("/api/planning/speech/synthesize", body, {
          "Sec-Fetch-Site": "cross-site",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(speech.synthesized).toHaveLength(0);
  });

  it("allows same-origin and header-less requests", () => {
    expect(() =>
      assertSameOrigin(json("/x", {}, { Origin: ORIGIN })),
    ).not.toThrow();
    expect(() => assertSameOrigin(json("/x", {}))).not.toThrow();
  });
});

describe("transcribe", () => {
  it("returns the transcript for an audio file", async () => {
    const response = await controller().transcribe(
      audioForm(new Blob(["abc"], { type: "audio/webm" })),
    );
    expect(await response.json()).toEqual({ text: "spoken words" });
    expect(speech.transcribed).toHaveLength(1);
  });

  it("rejects a missing file, a non-audio type, and a non-multipart body", async () => {
    await expect(
      controller().transcribe(audioForm(null)),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      controller().transcribe(audioForm("plain text")),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      controller().transcribe(
        audioForm(new Blob(["x"], { type: "application/pdf" })),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      controller().transcribe(json("/api/planning/speech/transcribe", {})),
    ).rejects.toMatchObject({ status: 415 });
    expect(speech.transcribed).toHaveLength(0);
  });

  it("enforces the size cap from the file and from Content-Length", async () => {
    const big = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], {
      type: "audio/webm",
    });
    await expect(controller().transcribe(audioForm(big))).rejects.toMatchObject(
      {
        status: 413,
      },
    );
    const declared = audioForm(new Blob(["x"], { type: "audio/webm" }));
    const request = new Request(declared, {
      headers: {
        "Content-Length": String(MAX_AUDIO_BYTES * 2),
        "Content-Type": declared.headers.get("content-type") ?? "",
      },
    });
    await expect(controller().transcribe(request)).rejects.toMatchObject({
      status: 413,
    });
    expect(speech.transcribed).toHaveLength(0);
  });

  it("maps speech errors without leaking detail", async () => {
    const failing = new PlanningController({
      authService: { requireUser } as unknown as AuthService,
      speech: {
        transcribe: async () => {
          throw new SpeechError("config", "ELEVENLABS key missing");
        },
        synthesize: async () => {
          throw new SpeechError("provider", "upstream 401 xi-api-key");
        },
      },
    });
    const config = (await failing
      .transcribe(audioForm(new Blob(["x"], { type: "audio/webm" })))
      .catch((e: unknown) => e)) as ApiError;
    expect(config.status).toBe(503);
    const provider = (await failing
      .synthesize(json("/api/planning/speech/synthesize", { text: "hi" }))
      .catch((e: unknown) => e)) as ApiError;
    expect(provider.status).toBe(502);
    expect(provider.message).not.toMatch(/xi-api-key|upstream/);
  });
});

describe("synthesize", () => {
  it("streams the audio with its content type and no caching", async () => {
    const response = await controller().synthesize(
      json("/api/planning/speech/synthesize", { text: "reply" }),
    );
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("reply");
    expect(speech.synthesized[0].text).toBe("reply");
  });

  it.each([{}, { text: "" }, { text: "   " }, { text: "x".repeat(4001) }])(
    "returns 400 for invalid text (case %#)",
    async (body) => {
      await expect(
        controller().synthesize(json("/api/planning/speech/synthesize", body)),
      ).rejects.toMatchObject({ status: 400 });
      expect(speech.synthesized).toHaveLength(0);
    },
  );

  it("accepts text at the limit", async () => {
    const response = await controller().synthesize(
      json("/api/planning/speech/synthesize", { text: "x".repeat(4000) }),
    );
    expect(response.status).toBe(200);
  });

  it("requires a JSON content type", async () => {
    const request = new Request(`${ORIGIN}/api/planning/speech/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ text: "hi" }),
    });
    await expect(controller().synthesize(request)).rejects.toMatchObject({
      status: 415,
    });
  });
});
