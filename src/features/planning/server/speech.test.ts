import { describe, expect, it, vi } from "vitest";
import { ElevenLabsSpeech } from "@/features/planning/server/elevenlabs.speech";
import { FakeSpeech } from "@/features/planning/server/fake.speech";
import { SpeechError } from "@/features/planning/server/speech";
import { createSpeech } from "@/features/planning/server/speech.factory";

function adapter(fetchImpl: typeof fetch) {
  return new ElevenLabsSpeech({
    apiKey: "secret",
    voiceId: "voice-1",
    fetch: fetchImpl,
  });
}

describe("ElevenLabsSpeech", () => {
  it("sends the key as a header and returns the transcript", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: "hello" })),
    );
    const result = await adapter(
      fetchMock as unknown as typeof fetch,
    ).transcribe({ audio: new Blob(["x"]) });
    expect(result).toEqual({ text: "hello" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(
      "secret",
    );
  });

  it("streams synthesized audio for the configured voice", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("audio-bytes", {
          headers: { "content-type": "audio/mpeg" },
        }),
    );
    const out = await adapter(fetchMock as unknown as typeof fetch).synthesize({
      text: "hi",
    });
    expect(out.contentType).toBe("audio/mpeg");
    expect(await new Response(out.audio).text()).toBe("audio-bytes");
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-1/stream",
    );
  });

  it("raises a SpeechError without leaking the key on provider failure", async () => {
    const fetchMock = vi.fn(async () => new Response("no", { status: 401 }));
    const error = await adapter(fetchMock as unknown as typeof fetch)
      .synthesize({ text: "hi" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechError);
    expect((error as Error).message).not.toContain("secret");
  });

  it.each(["code", "status"])(
    "retains the rejection %s without logging provider text",
    async (field) => {
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: {
                [field]: "detected_unusual_activity",
                message: "secret and recorded audio",
              },
            }),
            { status: 401 },
          ),
      );
      await expect(
        adapter(fetchMock as unknown as typeof fetch).transcribe({
          audio: new Blob(["audio"]),
        }),
      ).rejects.toThrow(
        "Speech provider returned 401 (detected_unusual_activity).",
      );
    },
  );

  it.each(["secret", "invalid secret", "x".repeat(100)])(
    "ignores sensitive or malformed rejection codes",
    async (code) => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: { code } }), { status: 401 }),
      );
      await expect(
        adapter(fetchMock as unknown as typeof fetch).synthesize({
          text: "hi",
        }),
      ).rejects.toThrow("Speech provider returned 401.");
    },
  );
});

describe("FakeSpeech and createSpeech", () => {
  it("round trips through the fake", async () => {
    const fake = new FakeSpeech("spoken words");
    expect(await fake.transcribe({ audio: new Blob() })).toEqual({
      text: "spoken words",
    });
    const out = await fake.synthesize({ text: "reply" });
    expect(await new Response(out.audio).text()).toBe("reply");
  });

  it("fails with a config error when not configured", () => {
    expect(() => createSpeech({})).toThrow(SpeechError);
  });
});
