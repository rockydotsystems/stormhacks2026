"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "@/features/planning/client/speech-api";

export type RecorderStatus = "idle" | "recording" | "transcribing";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was denied. Allow it in your browser settings, or type instead.";
  }
  if (name === "NotFoundError") {
    return "No microphone was found. Type your answer instead.";
  }
  return "The microphone could not start. Type your answer instead.";
}

// Records one utterance, transcribes it, and hands the text to onTranscript.
// A failure never touches the conversation. It only sets `error`.
export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      releaseMic();
    },
    [releaseMic],
  );

  const start = useCallback(async () => {
    setError(null);
    if (!isRecordingSupported()) {
      setError("Voice input is not supported in this browser. Type instead.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mimeType = pickMimeType();
      const instance = new MediaRecorder(
        media,
        mimeType ? { mimeType } : undefined,
      );
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.onstop = async () => {
        releaseMic();
        const audio = new Blob(chunks.current, {
          type: instance.mimeType || mimeType || "audio/webm",
        });
        chunks.current = [];
        if (audio.size === 0) {
          setStatus("idle");
          setError("No audio was captured. Please try again.");
          return;
        }
        setStatus("transcribing");
        try {
          const text = await transcribeAudio(audio);
          if (!text) {
            setError("I did not catch that. Please try again.");
          } else {
            onTranscriptRef.current(text);
          }
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Transcription failed. Please try again.",
          );
        } finally {
          setStatus("idle");
        }
      };
      recorder.current = instance;
      instance.start();
      setStatus("recording");
    } catch (caught) {
      releaseMic();
      setStatus("idle");
      setError(describeMicError(caught));
    }
  }, [releaseMic]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  return { status, error, start, stop, clearError: () => setError(null) };
}
