import { describe, expect, it } from "vitest";
import { audioLevel, createVoiceActivity } from "./voice-activity";

describe("voice activity", () => {
  it("waits for speech, then sends after a natural pause", () => {
    const activity = createVoiceActivity(0);
    expect(activity(0, 1000)).toBe("listen");
    for (let now = 1050; now <= 1500; now += 50) {
      expect(activity(0.04, now)).toBe("listen");
    }
    expect(activity(0, 2700)).toBe("listen");
    expect(activity(0, 2800)).toBe("send");
  });

  it("does not submit silence or a short microphone click", () => {
    const activity = createVoiceActivity(0);
    activity(0.1, 50);
    expect(activity(0, 1400)).toBe("listen");
    expect(activity(0, 15000)).toBe("timeout");
  });

  it("allows pauses within an utterance and limits continuous speech", () => {
    const activity = createVoiceActivity(0);
    for (let now = 50; now <= 500; now += 50) activity(0.04, now);
    expect(activity(0, 1500)).toBe("listen");
    expect(activity(0.04, 1600)).toBe("listen");
    expect(activity(0.04, 60000)).toBe("send");
  });

  it("measures actual audio energy regardless of sample sign", () => {
    expect(audioLevel(new Float32Array([0, 0, 0]))).toBe(0);
    expect(audioLevel(new Float32Array([0.5, -0.5]))).toBe(0.5);
  });
});
