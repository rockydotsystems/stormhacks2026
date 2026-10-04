"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "@/features/planning/client/speech-api";
import { audioLevel } from "@/features/planning/client/voice-activity";

export type PlaybackStatus = "idle" | "loading" | "playing" | "blocked";

// Plays the agent's reply aloud. Playback starts only after the user has chosen voice
// (a click). If the browser still blocks it, `status` becomes "blocked" and the UI offers
// a Play button, which is a fresh user gesture.
export function useSpeechPlayback() {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const generation = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const request = useRef<AbortController | null>(null);
  const frame = useRef<number | null>(null);
  const [level, setLevel] = useState(0);

  // Unlock Web Audio during the start button's user gesture, not after an API reply.
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

  const cleanup = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    source.current?.disconnect();
    source.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    setLevel(0);
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  useEffect(
    () => () => {
      generation.current += 1;
      request.current?.abort();
      cleanup();
      if (context.current) void context.current.close().catch(() => undefined);
      context.current = null;
    },
    [cleanup],
  );

  const speak = useCallback(
    async (text: string) => {
      const mine = ++generation.current;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      cleanup();
      setError(null);
      setStatus("loading");
      try {
        const blob = await synthesizeSpeech(text, controller.signal);
        if (mine !== generation.current) return;
        url.current = URL.createObjectURL(blob);
        const element = new Audio(url.current);
        audio.current = element;
        const meter = context.current;
        if (meter) {
          const analyser = meter.createAnalyser();
          analyserRef.current = analyser;
          analyser.fftSize = 1024;
          source.current = meter.createMediaElementSource(element);
          source.current.connect(analyser);
          analyser.connect(meter.destination);
          const samples = new Float32Array(analyser.fftSize);
          const measure = () => {
            if (mine !== generation.current) return;
            analyser.getFloatTimeDomainData(samples);
            setLevel(Math.min(1, audioLevel(samples) * 5));
            frame.current = requestAnimationFrame(measure);
          };
          measure();
        }
        element.onended = () => {
          if (mine === generation.current) {
            cleanup();
            setStatus("idle");
          }
        };
        element.onerror = () => {
          if (mine === generation.current) {
            cleanup();
            setStatus("idle");
            setError("Audio could not be played. Try again or type instead.");
          }
        };
        try {
          if (meter?.state === "suspended") {
            setStatus("blocked");
            return;
          }
          await element.play();
          if (mine === generation.current) setStatus("playing");
        } catch (caught) {
          if (mine !== generation.current) return;
          const blocked =
            caught instanceof DOMException && caught.name === "NotAllowedError";
          setStatus(blocked ? "blocked" : "idle");
          if (!blocked) {
            cleanup();
            setError("Audio could not be played. Try again or type instead.");
          }
        }
      } catch (caught) {
        if (mine !== generation.current) return;
        cleanup();
        setStatus("idle");
        setError(
          caught instanceof Error ? caught.message : "Speech playback failed.",
        );
      }
    },
    [cleanup],
  );

  const resume = useCallback(async () => {
    const mine = generation.current;
    const element = audio.current;
    if (!element) return;
    try {
      await context.current?.resume();
      if (mine !== generation.current) return;
      await element.play();
      if (mine !== generation.current) return;
      setStatus("playing");
    } catch {
      if (mine !== generation.current) return;
      cleanup();
      setStatus("idle");
      setError("Audio could not be played.");
    }
  }, [cleanup]);

  return {
    status,
    error,
    level,
    prepare,
    speak,
    stop,
    resume,
    clearError: () => setError(null),
  };
}
