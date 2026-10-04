"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function VoiceSession({
  onTurn,
  onEnd,
}: {
  onTurn: (text: string) => Promise<string | null>;
  onEnd: () => void;
}) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const alive = useRef(true);
  const playback = useSpeechPlayback();
  async function respond(text: string) {
    try {
      const reply = await onTurn(text);
      if (!alive.current) return;
      if (!reply)
        throw new Error(
          "The agent could not reply. Close voice mode to retry your message in chat.",
        );
      setTranscript(reply);
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
      setTranscript(text);
      setThinking(true);
      void respond(text);
    },
    { autoStop: true },
  );

  useEffect(() => {
    alive.current = true;
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>Talk to your planning agent</DialogTitle>
        <DialogDescription>
          Same document, same conversation. Voice powered by ElevenLabs.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="voice-panel">
        <div
          className="voice-orb-stage"
          data-state={state}
          style={{ "--voice-level": level } as CSSProperties}
          aria-hidden="true"
        >
          <div className="voice-orb-halo" />
          <div className="voice-orb-ring" />
          <div className="voice-orb">
            <div className="voice-orb-shine" />
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
        {transcript ? <p className="voice-transcript">{transcript}</p> : null}
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
      </DialogPanel>
      <DialogFooter className="sm:justify-between">
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
      </DialogFooter>
    </>
  );
}

export function VoiceConversation({
  disabled,
  open,
  onOpenChange,
  onTurn,
}: {
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTurn: (text: string) => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="voice-trigger"
            size="icon-sm"
            disabled={disabled}
            aria-label="Start AI voice conversation"
            title="Talk to the AI"
          />
        }
      >
        <MicrophoneIcon weight="bold" aria-hidden="true" />
        <SparkleIcon
          weight="fill"
          className="voice-trigger-sparkle"
          aria-hidden="true"
        />
      </DialogTrigger>
      <DialogPopup>
        {open ? (
          <VoiceSession onTurn={onTurn} onEnd={() => onOpenChange(false)} />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
