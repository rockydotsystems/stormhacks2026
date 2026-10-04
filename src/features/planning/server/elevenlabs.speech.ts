import {
  SpeechError,
  type SpeechPort,
  type SynthesizeRequest,
  type SynthesizedAudio,
  type TranscribeRequest,
} from "@/features/planning/server/speech";

const BASE_URL = "https://api.elevenlabs.io/v1";

// Plain fetch, so it runs in a Worker with no SDK. The key stays on the server.
export class ElevenLabsSpeech implements SpeechPort {
  constructor(
    private readonly options: {
      apiKey: string;
      voiceId: string;
      ttsModel?: string;
      sttModel?: string;
      fetch?: typeof fetch;
    },
  ) {}

  async transcribe({
    audio,
    language,
    signal,
  }: TranscribeRequest): Promise<{ text: string }> {
    const form = new FormData();
    form.set("model_id", this.options.sttModel ?? "scribe_v1");
    form.set("file", audio, "speech");
    if (language) form.set("language_code", language);
    const response = await this.call("/speech-to-text", {
      method: "POST",
      body: form,
      signal,
    });
    const body = (await response.json()) as { text?: unknown };
    if (typeof body.text !== "string") {
      throw new SpeechError("provider", "Transcription returned no text.");
    }
    return { text: body.text };
  }

  async synthesize({
    text,
    voiceId,
    signal,
  }: SynthesizeRequest): Promise<SynthesizedAudio> {
    const voice = encodeURIComponent(voiceId ?? this.options.voiceId);
    const response = await this.call(`/text-to-speech/${voice}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: this.options.ttsModel ?? "eleven_flash_v2_5",
      }),
      signal,
    });
    if (!response.body) {
      throw new SpeechError("provider", "Speech synthesis returned no audio.");
    }
    return {
      audio: response.body,
      contentType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const doFetch = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...init.headers, "xi-api-key": this.options.apiKey },
      });
    } catch (error) {
      throw new SpeechError("provider", "Speech provider unreachable.", {
        cause: error,
      });
    }
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      let code: string | undefined;
      if (body && typeof body === "object" && "detail" in body) {
        const detail = body.detail;
        if (detail && typeof detail === "object") {
          // Retain only the machine-readable code, never raw messages, audio or credentials.
          const candidates = [
            "code" in detail ? detail.code : undefined,
            "status" in detail ? detail.status : undefined,
          ];
          code = candidates.find(
            (value): value is string =>
              typeof value === "string" &&
              /^[a-z][a-z0-9_]{0,79}$/.test(value) &&
              !value.includes(this.options.apiKey),
          );
        }
      }
      throw new SpeechError(
        "provider",
        `Speech provider returned ${response.status}${code ? ` (${code})` : ""}.`,
      );
    }
    return response;
  }
}
