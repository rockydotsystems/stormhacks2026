"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import { happy, thinking as thinkingExpression } from "blobatar/expression";
import "blobatar/motion.css";
import "blobatar/gaze.css";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { voiceBubble } from "@/features/planning/client/voice-bubble";
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
  ready: "Let’s talk it through",
  starting: "Connecting your microphone…",
  listening: "I’m listening",
  thinking: "Thinking it through…",
  speaking: "Speaking",
  blocked: "Your reply is ready",
  paused: "Microphone paused",
  error: "Conversation paused",
};

export function VoiceConversation({
  onTurn,
  onEnd,
  reasoning,
  initialReply,
  characterId,
}: {
  onTurn: (text: string) => Promise<string | null>;
  onEnd: () => void;
  reasoning: string;
  initialReply: string;
  characterId: string;
}) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState(initialReply);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const playback = useSpeechPlayback();
  const { ref: character } = useGaze({ travel: 3, lookAt: "pointer" });
  async function respond(text: string) {
    try {
      const reply = await onTurn(text);
      if (!alive.current) return;
      if (!reply)
        throw new Error(
          "The agent could not reply. Select Read more to retry your message in the transcript.",
        );
      setReplyText(reply);
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
      setReplyText("");
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
  useEffect(() => {
    if (
      active &&
      !paused &&
      !thinking &&
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
    voiceError,
    playback.status,
    recorder.status,
    start,
  ]);

  let state: VoiceState = "ready";
  if (voiceError) state = "error";
  else if (
    thinking ||
    recorder.status === "transcribing" ||
    playback.status === "loading"
  )
    state = "thinking";
  else if (playback.status === "playing") state = "speaking";
  else if (playback.status === "blocked") state = "blocked";
  else if (paused) state = "paused";
  else if (recorder.status === "recording") state = "listening";
  else if (active) state = "starting";
  const level = state === "speaking" ? playback.level : recorder.level;
  const bubble = voiceBubble({
    thinking: (thinking && !replyText) || recorder.status === "transcribing",
    reasoning: recorder.status === "transcribing" ? "" : reasoning,
    reply: replyText,
  });

  return (
    <div
      className="voice-conversation"
      onKeyDown={(event) => {
        if (event.key === "Escape") onEnd();
      }}
    >
      <header className="voice-heading">
        <h2 ref={heading} tabIndex={-1}>
          Talk it through
        </h2>
        <span>Voice powered by ElevenLabs</span>
      </header>
      <div className="voice-panel">
        <div
          className="voice-orb-stage"
          data-state={state}
          style={{ "--voice-level": level } as CSSProperties}
          aria-hidden="true"
        >
          <div className="voice-orb-halo" />
          <div className="voice-orb-ring" />
          <div className="voice-orb" data-character={characterId}>
            <Blobatar
              ref={character}
              name={characterId}
              size={160}
              animate="always"
              background={false}
              expression={state === "thinking" ? thinkingExpression : happy}
              aria-hidden="true"
            />
          </div>
        </div>
        <p className="voice-status" role="status">
          {labels[state]}
        </p>
        <p className="voice-hint">
          {state === "listening"
            ? "Speak naturally. A short pause sends your message."
            : state === "speaking"
              ? "Listen, or interrupt to take the next turn."
              : state === "thinking"
                ? "Working with your document and conversation."
                : "Start when you’re ready. You can return to typing anytime."}
        </p>
        {voiceError ? (
          <p className="voice-error" role="alert">
            {voiceError}
          </p>
        ) : null}
        <div className="voice-bubble-slot">
          {bubble ? (
            <div className="voice-thought-bubble" data-kind={bubble.kind}>
              {bubble.kind === "thought" ? (
                <svg
                  className="voice-thought-cloud"
                  viewBox="0 0 300 140"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M 36 27 C 18 16 2 35 12 53 C -3 71 8 96 32 97 C 34 120 61 133 83 119 C 105 136 135 133 151 122 C 174 136 202 131 215 118 C 239 130 269 122 270 102 C 297 103 309 79 289 59 C 302 35 277 15 254 27 C 243 4 210 3 193 18 C 172 1 139 4 127 20 C 107 3 78 8 68 23 C 58 14 43 16 36 27 Z" />
                </svg>
              ) : null}
              <span className="voice-bubble-label">
                {bubble.kind === "thought" ? "Thinking" : "Reply"}
              </span>
              <p>{bubble.text}</p>
            </div>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onEnd}>
            Read more
          </Button>
        </div>
        {state === "ready" ? (
          <Button
            type="button"
            onClick={() => {
              playback.prepare();
              recorder.prepare();
              setActive(true);
            }}
          >
            <MicrophoneIcon aria-hidden="true" /> Start conversation
          </Button>
        ) : null}
        {state === "blocked" ? (
          <Button type="button" onClick={() => void playback.resume()}>
            Play reply
          </Button>
        ) : null}
        {voiceError && !error ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
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
            variant="outline"
            onClick={() => {
              playback.stop();
              setPaused(false);
            }}
          >
            Interrupt and speak
          </Button>
        ) : null}
      </div>
      <div className="voice-controls">
        <Button
          type="button"
          variant="outline"
          disabled={!active || Boolean(voiceError)}
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
        <Button type="button" variant="destructive" onClick={onEnd}>
          <PhoneDisconnectIcon aria-hidden="true" /> End conversation
        </Button>
      </div>
    </div>
  );
}
