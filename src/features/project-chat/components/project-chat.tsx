"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  MicrophoneIcon,
  SpeakerHighIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useVoiceRecorder } from "@/features/planning/client/use-voice-recorder";
import { useSpeechPlayback } from "@/features/planning/client/use-speech-playback";
import { projectPath } from "@/features/dashboard/routes";
import type { ChatSource, ChatTurn } from "../contracts";
import {
  useAskProjectChat,
  useProjectChat,
  type ChatScope,
} from "../client/queries";

function CitedAnswer({
  text,
  sources,
}: {
  text: string;
  sources: ChatSource[];
}) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-7">
      {text.split(/(\[\d+\])/).map((part, index) => {
        const source = sources.find((item) => `[${item.id}]` === part);
        return source ? (
          <Link
            key={index}
            href={source.href}
            className="text-primary underline underline-offset-4"
            aria-label={`Source ${source.id}: ${source.title}`}
          >
            {part}
          </Link>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        );
      })}
    </p>
  );
}

export function ProjectChat({
  scope,
  id,
  projectName,
}: {
  scope: ChatScope;
  id: string;
  projectName: string;
}) {
  const chat = useProjectChat(scope, id);
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [finished, setFinished] = useState(false);
  const ask = useAskProjectChat(scope, id, (event) => {
    if (event.type === "answer") setStreamedAnswer(event.text);
    if (event.type === "done") setFinished(true);
  });
  const [draft, setDraft] = useState("");
  const [via, setVia] = useState<"text" | "voice">("text");
  const retry = useRef<{
    content: string;
    clientMessageId: string;
    via: "text" | "voice";
  } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const playback = useSpeechPlayback();
  const recorder = useVoiceRecorder((text) => {
    setDraft(text);
    setVia("voice");
  });
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [chat.data?.turns.length, ask.isPending, streamedAnswer]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || ask.isPending || recorder.status !== "idle") return;
    playback.stop();
    setStreamedAnswer("");
    setFinished(false);
    const controller = new AbortController();
    request.current = controller;
    if (
      !retry.current ||
      retry.current.content !== content ||
      retry.current.via !== via
    )
      retry.current = { content, via, clientMessageId: crypto.randomUUID() };
    try {
      const turn = await ask.mutateAsync({
        ...retry.current,
        signal: controller.signal,
      });
      if (!mounted.current) return;
      retry.current = null;
      setDraft("");
      setVia("text");
      if (turn.via === "voice") void playback.speak(turn.answer);
    } catch {
      /* Keep the question and retry ID intact. */
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  if (chat.isPending)
    return (
      <div className="documents-empty" role="status">
        Loading private chat…
      </div>
    );
  if (chat.isError)
    return (
      <div className="documents-empty" role="alert">
        <p>{chat.error.message}</p>
        <Button onClick={() => chat.refetch()}>Try again</Button>
        <Button
          variant="ghost"
          render={<Link href={projectPath(scope.projectId)} />}
        >
          Back to project
        </Button>
      </div>
    );
  const voiceBusy = recorder.status !== "idle";
  const pending = ask.isPending && !finished;
  const turns: ChatTurn[] =
    pending && ask.variables
      ? [
          ...chat.data.turns,
          {
            id: "streaming",
            question: ask.variables.content,
            answer: streamedAnswer,
            via: ask.variables.via,
            sources: [],
            createdAt: "",
          },
        ]
      : chat.data.turns;
  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <header className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={projectPath(scope.projectId)} />}
        >
          <ArrowLeftIcon aria-hidden="true" />
          {projectName}
        </Button>
        <h1 className="break-words text-2xl font-semibold tracking-tight">
          {chat.data.title}
        </h1>
      </header>
      <div className="flex-1 space-y-6" role="log" aria-label="Project chat">
        {turns.map((turn) => (
          <section
            key={turn.id}
            className="space-y-4"
            aria-label="Question and answer"
          >
            <div className="ml-auto max-w-[90%] rounded-xl bg-muted p-4">
              <h2 className="mb-1 text-xs font-medium text-muted-foreground">
                You{turn.via === "voice" ? " · Voice" : ""}
              </h2>
              <p className="whitespace-pre-wrap break-words text-sm">
                {turn.question}
              </p>
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Project assistant
                </h3>
                {turn.id !== "streaming" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={voiceBusy || ask.isPending}
                    onClick={() => {
                      playback.prepare();
                      void playback.speak(turn.answer);
                    }}
                  >
                    <SpeakerHighIcon aria-hidden="true" />
                    Read aloud
                  </Button>
                )}
              </div>
              {turn.id === "streaming" && !turn.answer ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Searching project history…
                </p>
              ) : (
                <CitedAnswer text={turn.answer} sources={turn.sources} />
              )}
              {turn.sources.length > 0 && (
                <nav
                  aria-label="Answer sources"
                  className="space-y-2 border-t pt-3"
                >
                  {turn.sources.map((source) => (
                    <Link
                      key={source.id}
                      href={source.href}
                      className="block rounded-lg p-2 text-sm hover:bg-muted focus-visible:outline-ring"
                    >
                      <span className="font-medium text-primary">
                        [{source.id}] {source.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {source.version
                          ? `Published v${source.version}`
                          : "Draft snapshot"}{" "}
                        · {new Date(source.createdAt).toLocaleString()} · View
                        change and reasons
                      </span>
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </section>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={send}
        className="sticky bottom-0 space-y-3 rounded-xl border bg-background p-4"
      >
        <Label htmlFor="project-chat-question">Ask about this project</Label>
        <Textarea
          id="project-chat-question"
          value={draft}
          maxLength={8000}
          disabled={ask.isPending || voiceBusy}
          placeholder="Why did we choose this approach?"
          onChange={(event) => {
            setDraft(event.target.value);
            setVia("text");
          }}
        />
        {(ask.error || recorder.error || playback.error) && (
          <p role="alert" className="text-sm text-destructive">
            {ask.error && ask.variables?.signal.aborted
              ? "Answer stopped. Send the question again to retry."
              : ask.error?.message || recorder.error || playback.error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {ask.isPending && (
              <Button
                variant="outline"
                onClick={() => request.current?.abort()}
              >
                <StopIcon aria-hidden="true" />
                Stop generating
              </Button>
            )}
            <Button
              variant="outline"
              disabled={
                ask.isPending ||
                recorder.status === "starting" ||
                recorder.status === "transcribing"
              }
              onClick={() => {
                if (recorder.status === "recording") recorder.stop();
                else {
                  playback.stop();
                  playback.prepare();
                  recorder.prepare();
                  void recorder.start();
                }
              }}
            >
              <MicrophoneIcon aria-hidden="true" />
              {recorder.status === "recording"
                ? "Finish recording"
                : recorder.status === "transcribing"
                  ? "Transcribing…"
                  : recorder.status === "starting"
                    ? "Starting microphone…"
                    : "Speak question"}
            </Button>
            {voiceBusy && (
              <Button variant="ghost" onClick={recorder.cancel}>
                Cancel recording
              </Button>
            )}
            {playback.status === "blocked" && (
              <Button variant="outline" onClick={() => playback.resume()}>
                Play answer
              </Button>
            )}
            {(playback.status === "playing" ||
              playback.status === "loading") && (
              <Button variant="ghost" onClick={playback.stop}>
                <StopIcon aria-hidden="true" />
                Stop audio
              </Button>
            )}
          </div>
          <Button
            type="submit"
            disabled={!draft.trim() || ask.isPending || voiceBusy}
          >
            Send question
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {voiceBusy
            ? "Recording is used only to transcribe your question."
            : via === "voice"
              ? "Review your transcript, then send. The answer will be read aloud."
              : "Answers use recorded evidence; missing reasons are not assumed."}
        </p>
      </form>
    </div>
  );
}
