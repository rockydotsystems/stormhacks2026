// Raw fetch for audio. apiClient forces a JSON content type, which breaks multipart uploads
// and cannot return an audio body.

async function failure(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error
      : fallback;
  return new Error(message);
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const form = new FormData();
  form.set("audio", audio, "speech");
  const response = await fetch("/api/planning/speech/transcribe", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw await failure(response, "Transcription failed. Please try again.");
  }
  const body = (await response.json()) as { text?: unknown };
  if (typeof body.text !== "string") {
    throw new Error("Transcription returned no text.");
  }
  return body.text.trim();
}

export async function synthesizeSpeech(text: string): Promise<Blob> {
  const response = await fetch("/api/planning/speech/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw await failure(response, "Speech playback failed.");
  }
  return response.blob();
}
