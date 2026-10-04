"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "@/features/planning/client/speech-api";

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

  const cleanup = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  const speak = useCallback(
    async (text: string) => {
      const mine = ++generation.current;
      cleanup();
      setError(null);
      setStatus("loading");
      try {
        const blob = await synthesizeSpeech(text);
        if (mine !== generation.current) return;
        url.current = URL.createObjectURL(blob);
        const element = new Audio(url.current);
        audio.current = element;
        element.onended = () => {
          if (mine === generation.current) setStatus("idle");
        };
        try {
          await element.play();
          if (mine === generation.current) setStatus("playing");
        } catch (caught) {
          if (mine !== generation.current) return;
          const blocked =
            caught instanceof DOMException && caught.name === "NotAllowedError";
          setStatus(blocked ? "blocked" : "idle");
          if (!blocked) setError("Audio could not be played.");
        }
      } catch (caught) {
        if (mine !== generation.current) return;
        setStatus("idle");
        setError(
          caught instanceof Error ? caught.message : "Speech playback failed.",
        );
      }
    },
    [cleanup],
  );

  const resume = useCallback(async () => {
    const element = audio.current;
    if (!element) return;
    try {
      await element.play();
      setStatus("playing");
    } catch {
      setStatus("idle");
      setError("Audio could not be played.");
    }
  }, []);

  return { status, error, speak, stop, resume };
}
