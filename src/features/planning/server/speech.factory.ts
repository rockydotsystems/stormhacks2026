import { ElevenLabsSpeech } from "@/features/planning/server/elevenlabs.speech";
import {
  SpeechError,
  type SpeechPort,
} from "@/features/planning/server/speech";

type Env = Record<string, string | undefined>;

export function createSpeech(env: Env = process.env): SpeechPort {
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new SpeechError(
      "config",
      "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set.",
    );
  }
  return new ElevenLabsSpeech({ apiKey, voiceId });
}
