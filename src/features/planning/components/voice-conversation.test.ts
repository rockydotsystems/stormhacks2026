import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoiceConversation } from "./voice-conversation";

const speech = vi.hoisted(() => ({
  recorder: { status: "idle", error: null as string | null, level: 0.6 },
  playback: { status: "idle", error: null as string | null, level: 0.7 },
}));
vi.mock("@/features/planning/client/use-voice-recorder", () => ({
  useVoiceRecorder: () => ({
    ...speech.recorder,
    start: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock("@/features/planning/client/use-speech-playback", () => ({
  useSpeechPlayback: () => ({ ...speech.playback }),
}));

// These states must retain a text fallback even when speech cannot proceed.
describe("voice composer", () => {
  it.each([
    ["idle", "idle", null, false, "Microphone off", "Start microphone"],
    ["recording", "idle", null, false, "Listening to you", "Send now"],
    ["transcribing", "idle", null, false, "Thinking it through…", null],
    ["idle", "playing", null, false, "Agent speaking", "Interrupt and speak"],
    ["idle", "blocked", null, false, "Your reply is ready", "Play reply"],
    [
      "idle",
      "idle",
      "Allow the microphone, or type instead.",
      false,
      "Conversation paused",
      "Try voice again",
    ],
    ["idle", "idle", null, true, "Thinking it through…", null],
  ])(
    "keeps recovery available for %s / %s",
    (recording, playing, error, busy, status, action) => {
      speech.recorder.status = recording;
      speech.recorder.error = error;
      speech.playback.status = playing;
      const html = renderToStaticMarkup(
        createElement(VoiceConversation, {
          onTurn: async () => null,
          onEnd: vi.fn(),
          busy,
        }),
      );
      expect(html).toContain(status);
      expect(html).toContain("Type instead");
      if (action) expect(html).toContain(action);
      expect(html).not.toContain("<textarea");
      expect(html).toContain('class="voice-signal"');
      if (error) expect(html).toContain('role="alert"');
    },
  );
});
