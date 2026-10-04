import type {
  SpeechPort,
  SynthesizeRequest,
  SynthesizedAudio,
  TranscribeRequest,
} from "@/features/planning/server/speech";

// Deterministic adapter for tests. Transcription returns a fixed text. Synthesis returns the text bytes.
export class FakeSpeech implements SpeechPort {
  readonly transcribed: TranscribeRequest[] = [];
  readonly synthesized: SynthesizeRequest[] = [];

  constructor(private readonly transcript = "") {}

  async transcribe(request: TranscribeRequest): Promise<{ text: string }> {
    this.transcribed.push(request);
    return { text: this.transcript };
  }

  async synthesize(request: SynthesizeRequest): Promise<SynthesizedAudio> {
    this.synthesized.push(request);
    const bytes = new TextEncoder().encode(request.text);
    return {
      audio: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      contentType: "audio/mpeg",
    };
  }
}
