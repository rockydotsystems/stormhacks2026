"use client";

import { useEffect, useRef, useState } from "react";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  KeyboardIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useSpeechPlayback } from "@/features/planning/client/use-speech-playback";
import { useVoiceRecorder } from "@/features/planning/client/use-voice-recorder";

type VoiceState =
  | "ready"
  | "starting"
  | "listening"
  | "thinking"
  | "speaking"
  | "blocked"
  | "paused"
  | "error";

const labels: Record<VoiceState, string> = {
  ready: "Microphone off",
  starting: "Connecting your microphone…",
  listening: "Listening to you",
  thinking: "Thinking it through…",
  speaking: "Agent speaking",
  blocked: "Your reply is ready",
  paused: "Microphone paused",
  error: "Conversation paused",
};

export function VoiceConversation({
  onTurn,
  onEnd,
  busy,
}: {
  onTurn: (text: string) => Promise<string | null>;
  onEnd: () => void;
  busy: boolean;
}) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const playback = useSpeechPlayback();
  async function respond(text: string) {
    try {
      const reply = await onTurn(text);
      if (!alive.current) return;
      if (!reply)
        throw new Error(
          "The agent could not reply. Retry your message in the chat above.",
        );
      await playback.speak(reply);
    } catch (caught) {
      if (alive.current)
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to reply. Try again or type instead.",
        );
    } finally {
      if (alive.current) setThinking(false);
    }
  }

  const recorder = useVoiceRecorder(
    (text) => {
      setThinking(true);
      void respond(text);
    },
    { autoStop: true },
  );

  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  const voiceError = error ?? recorder.error ?? playback.error;
  const start = recorder.start;
  const cancel = recorder.cancel;
  useEffect(() => {
    if (
      busy &&
      (recorder.status === "recording" || recorder.status === "starting")
    )
      cancel();
  }, [busy, recorder.status, cancel]);
  useEffect(() => {
    if (
      active &&
      !paused &&
      !thinking &&
      !busy &&
      !voiceError &&
      playback.status === "idle" &&
      recorder.status === "idle"
    ) {
      void start();
    }
  }, [
    active,
    paused,
    thinking,
    busy,
    voiceError,
    playback.status,
    recorder.status,
    start,
  ]);

  let state: VoiceState = "ready";
  if (voiceError) state = "error";
  else if (
    thinking ||
    busy ||
    recorder.status === "transcribing" ||
    playback.status === "loading"
  )
    state = "thinking";
  else if (playback.status === "playing") state = "speaking";
  else if (playback.status === "blocked") state = "blocked";
  else if (paused) state = "paused";
  else if (recorder.status === "recording") state = "listening";
  else if (active) state = "starting";

  return (
    <div
      className="voice-conversation"
      onKeyDown={(event) => {
        if (event.key === "Escape") onEnd();
      }}
    >
      <header className="voice-heading">
        <h2 ref={heading} tabIndex={-1}>
          Voice
        </h2>
        <p className="voice-status" role="status">
          {labels[state]}
        </p>
      </header>
      <svg
        className="voice-signal"
        viewBox="0 0 300 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-state={state}
      >
        {state === "speaking" ? (
          <g className="voice-agent-bars">
            {Array.from({ length: 40 }, (_, i) => {
              const height =
                3 + playback.level * (10 + 25 * Math.abs(Math.sin(i * 0.8)));
              return (
                <rect
                  key={i}
                  x={i * 7.6}
                  y={(40 - height) / 2}
                  width="3"
                  height={height}
                  rx="1.5"
                />
              );
            })}
          </g>
        ) : (
          <path
            className="voice-user-wave"
            d={Array.from({ length: 101 }, (_, i) => {
              const amplitude = state === "listening" ? recorder.level * 16 : 0;
              const y =
                20 +
                Math.sin(i * 0.55) * Math.sin((i * Math.PI) / 100) * amplitude;
              return `${i === 0 ? "M" : "L"}${i * 3},${y.toFixed(2)}`;
            }).join(" ")}
          />
        )}
      </svg>
      <p className="voice-hint">
        {state === "listening"
          ? "Pause briefly to send, or send now."
          : state === "speaking"
            ? "Interrupt to take the next turn."
            : "Voice messages stay in this conversation."}
      </p>
      {voiceError ? (
        <p className="voice-error" role="alert">
          {voiceError}
        </p>
      ) : null}
      <div className="voice-controls">
        {state === "listening" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={recorder.stop}
          >
            Send now
          </Button>
        ) : null}
        {state === "ready" ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              playback.prepare();
              recorder.prepare();
              setActive(true);
            }}
          >
            <MicrophoneIcon aria-hidden="true" /> Start microphone
          </Button>
        ) : null}
        {state === "blocked" ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void playback.resume()}
          >
            Play reply
          </Button>
        ) : null}
        {voiceError ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              recorder.clearError();
              playback.clearError();
              recorder.prepare();
              playback.prepare();
              setPaused(false);
              setActive(true);
            }}
          >
            Try voice again
          </Button>
        ) : null}
        {state === "speaking" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              playback.stop();
              setPaused(false);
            }}
          >
            Interrupt and speak
          </Button>
        ) : null}
        {active ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !active ||
              Boolean(voiceError) ||
              thinking ||
              busy ||
              recorder.status === "transcribing"
            }
            aria-pressed={paused}
            onClick={() => {
              if (!paused) recorder.cancel();
              setPaused(!paused);
            }}
          >
            {paused ? (
              <MicrophoneIcon aria-hidden="true" />
            ) : (
              <MicrophoneSlashIcon aria-hidden="true" />
            )}
            {paused ? "Resume mic" : "Pause mic"}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onEnd}>
          <KeyboardIcon aria-hidden="true" /> Type instead
        </Button>
      </div>
    </div>
  );
}
