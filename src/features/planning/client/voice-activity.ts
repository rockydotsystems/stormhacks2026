// Ignore short clicks and allow a natural pause before submitting an utterance.
export function createVoiceActivity(startedAt: number) {
  let speechMs = 0;
  let previousAt = startedAt;
  let lastSpeechAt = startedAt;

  return (level: number, now: number): "listen" | "send" | "timeout" => {
    const elapsed = Math.min(now - previousAt, 100);
    previousAt = now;
    if (level >= 0.018) {
      speechMs += elapsed;
      lastSpeechAt = now;
    }
    const hasSpeech = speechMs >= 250;
    if (hasSpeech && (now - lastSpeechAt >= 1300 || now - startedAt >= 60000)) {
      return "send";
    }
    if (!hasSpeech && now - startedAt >= 15000) return "timeout";
    return "listen";
  };
}

export function audioLevel(samples: Float32Array): number {
  const energy = samples.reduce((sum, sample) => sum + sample * sample, 0);
  return Math.sqrt(energy / samples.length);
}
