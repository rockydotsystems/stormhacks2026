"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "@/features/planning/client/speech-api";
import {
  audioLevel,
  createVoiceActivity,
} from "@/features/planning/client/voice-activity";

export type RecorderStatus = "idle" | "starting" | "recording" | "transcribing";

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
export function useVoiceRecorder(
  onTranscript: (text: string) => void,
  options: { autoStop?: boolean } = {},
) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [level, setLevel] = useState(0);
  const generation = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaStreamAudioSourceNode | null>(null);
  const frame = useRef<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const releaseMic = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    source.current?.disconnect();
    source.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.ondataavailable = null;
      if (recorder.current.state === "recording") recorder.current.stop();
    }
    recorder.current = null;
    chunks.current = [];
    releaseMic();
    setLevel(0);
    setStatus("idle");
  }, [releaseMic]);

  useEffect(
    () => () => {
      cancel();
      if (context.current) void context.current.close().catch(() => undefined);
      context.current = null;
    },
    [cancel],
  );

  const prepare = useCallback(() => {
    try {
      context.current ??= new AudioContext();
      void context.current.resume().catch(() => undefined);
    } catch {
      setError(
        "Voice conversation is not supported in this browser. Type instead.",
      );
    }
  }, []);

  const start = useCallback(async () => {
    cancel();
    const mine = generation.current;
    setError(null);
    if (!isRecordingSupported()) {
      setError("Voice input is not supported in this browser. Type instead.");
      return;
    }
    setStatus("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (mine !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
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
        if (mine !== generation.current) return;
        releaseMic();
        setLevel(0);
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
        const controller = new AbortController();
        request.current = controller;
        try {
          const text = await transcribeAudio(audio, controller.signal);
          if (mine !== generation.current) return;
          if (!text) {
            setError("I did not catch that. Please try again.");
          } else {
            onTranscriptRef.current(text);
          }
        } catch (caught) {
          if (mine !== generation.current) return;
          setError(
            caught instanceof Error
              ? caught.message
              : "Transcription failed. Please try again.",
          );
        } finally {
          if (mine === generation.current) setStatus("idle");
        }
      };
      recorder.current = instance;
      instance.start();
      setStatus("recording");
      if (options.autoStop) {
        const meter = context.current ?? new AudioContext();
        context.current = meter;
        await meter.resume();
        if (mine !== generation.current) return;
        const analyser = meter.createAnalyser();
        analyser.fftSize = 1024;
        source.current = meter.createMediaStreamSource(media);
        source.current.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const activity = createVoiceActivity(performance.now());
        const measure = () => {
          if (mine !== generation.current || instance.state !== "recording")
            return;
          analyser.getFloatTimeDomainData(samples);
          const volume = audioLevel(samples);
          setLevel(Math.min(1, volume * 8));
          const action = activity(volume, performance.now());
          if (action === "send") {
            instance.stop();
          } else if (action === "timeout") {
            cancel();
            setError("No speech detected. Try again when you are ready.");
          } else {
            frame.current = requestAnimationFrame(measure);
          }
        };
        measure();
      }
    } catch (caught) {
      if (mine !== generation.current) return;
      cancel();
      setError(describeMicError(caught));
    }
  }, [releaseMic, cancel, options.autoStop]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  return {
    status,
    error,
    level,
    start,
    prepare,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
