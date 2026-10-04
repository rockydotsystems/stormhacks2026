// The speech port. Speech is a layer around the one planning brain. It turns audio into a
// finished user turn and reply text into audio. It never runs the agent itself.

export type TranscribeRequest = {
  audio: Blob;
  language?: string;
  signal?: AbortSignal;
};

export type SynthesizeRequest = {
  text: string;
  voiceId?: string;
  signal?: AbortSignal;
};

export type SynthesizedAudio = {
  audio: ReadableStream<Uint8Array>;
  contentType: string;
};

export interface SpeechPort {
  transcribe(request: TranscribeRequest): Promise<{ text: string }>;
  synthesize(request: SynthesizeRequest): Promise<SynthesizedAudio>;
}

export type SpeechErrorKind = "config" | "provider";

export class SpeechError extends Error {
  constructor(
    public readonly kind: SpeechErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SpeechError";
  }
}
