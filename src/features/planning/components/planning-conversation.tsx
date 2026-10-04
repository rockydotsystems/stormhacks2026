"use client";

import {
  ArrowUpIcon,
  FileTextIcon,
  InfoIcon,
  MicrophoneIcon,
  SparkleIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  SquareIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { PlanningApiError } from "@/features/planning/client/api";
import {
  useConversation,
  useCreateConversation,
  useSendMessage,
} from "@/features/planning/client/queries";
import {
  activeQuestions,
  chatItems,
  CONFIRM_TEXT,
  errorText,
  initialTurnUi,
  isBusy,
  showConfirmButton,
  showTyping,
  titleFromPitch,
  turnReducer,
  type PendingTurn,
} from "@/features/planning/client/state";
import { useSpeechPlayback } from "@/features/planning/client/use-speech-playback";
import {
  isRecordingSupported,
  useVoiceRecorder,
} from "@/features/planning/client/use-voice-recorder";
import { ChecklistStrip } from "@/features/planning/components/checklist-strip";
import { cn } from "@/lib/utils";

// The chat half of a planning session, styled to sit inside the workspace shell. The server owns
// the conversation. This component shows it, and keeps only the turn in flight, the reply
// streaming in, and the last failure. A conversation is created on the first message, so an
// empty "New conversation" never reaches the database.
export function PlanningConversation({
  serverId,
  active,
  onServerId,
  onDocument,
  onOpenDraft,
}: {
  serverId?: string;
  active: boolean;
  // Called once, when the first message creates the conversation on the server.
  onServerId: (id: string, title: string) => void;
  // Called when the conversation has a working document, so the shell can show it.
  onDocument: () => void;
  onOpenDraft: () => void;
}) {
  const detail = useConversation(serverId ?? null);
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();
  const [ui, dispatch] = useReducer(turnReducer, initialTurnUi);
  const [draft, setDraft] = useState("");
  const [speakReplies, setSpeakReplies] = useState(false);
  const playback = useSpeechPlayback();
  const createdId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const composerId = useId();

  const conversation = detail.data;
  const messages = conversation?.messages ?? [];
  const phase = conversation?.phase ?? "grilling";
  const items = chatItems(messages, ui);
  const questions = activeQuestions(messages, ui);
  const busy = isBusy(ui);
  const loading = Boolean(serverId) && detail.isPending;
  const workingDocument = conversation?.workingDocument ?? null;
  const lastProduced = items.findLast((item) => item.producedChangeId)?.key;

  async function run(turn: PendingTurn) {
    try {
      let id = serverId ?? createdId.current;
      if (!id) {
        const created = await createConversation.mutateAsync({
          projectName: titleFromPitch(turn.text),
        });
        id = created.id;
        createdId.current = id;
        onServerId(id, created.title);
      }
      const final = await sendMessage.mutateAsync({
        conversationId: id,
        input: {
          text: turn.text,
          via: turn.via,
          clientMessageId: turn.clientMessageId,
        },
        onDelta: (text) => dispatch({ type: "delta", text }),
      });
      dispatch({ type: "succeeded" });
      if (turn.speak) void playback.speak(final.assistantMessage.content);
    } catch (caught) {
      const error = caught instanceof PlanningApiError ? caught : null;
      dispatch({
        type: "failed",
        kind: error?.kind ?? "other",
        message: error?.message ?? "Something went wrong. Please try again.",
      });
    }
  }

  function send(text: string, via: "text" | "voice" = "text") {
    if (busy) return;
    playback.stop();
    const turn: PendingTurn = {
      clientMessageId: crypto.randomUUID(),
      text,
      via,
      speak: via === "voice" || speakReplies,
    };
    dispatch({ type: "send", turn });
    void run(turn);
  }

  function retry() {
    if (ui.status !== "error" || !ui.pending) return;
    dispatch({ type: "retry" });
    void run(ui.pending);
  }

  const recorder = useVoiceRecorder((text) => {
    setSpeakReplies(true);
    send(text, "voice");
  });

  const onDocumentRef = useRef(onDocument);
  useEffect(() => {
    onDocumentRef.current = onDocument;
  });
  const changeId = workingDocument?.changeId ?? null;
  useEffect(() => {
    if (changeId) onDocumentRef.current();
  }, [changeId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, ui.streamText, ui.status, active, loading]);
  useEffect(() => {
    if (active) return;
    playback.stop();
    if (recorder.status === "recording") recorder.stop();
    // Only a change of the active conversation should stop audio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || busy) return;
    send(draft.trim());
    setDraft("");
  }

  const recording = recorder.status === "recording";
  const transcribing = recorder.status === "transcribing";
  const voiceSupported = isRecordingSupported();
  const voiceError = recorder.error ?? playback.error;
  const showStrip = items.length > 0 || Boolean(conversation);

  return (
    <div className={cn(active ? "contents" : "hidden")}>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
        role="log"
        aria-label="Planning conversation"
        aria-live="polite"
      >
        <div className="mx-auto max-w-2xl py-10 sm:py-12">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Loading conversation
            </div>
          ) : detail.isError ? (
            <Alert variant="error">
              <WarningCircleIcon aria-hidden="true" />
              <AlertTitle>This conversation could not be loaded</AlertTitle>
              <AlertDescription>
                {detail.error instanceof PlanningApiError
                  ? errorText(detail.error.kind, detail.error.message)
                  : "Try again in a moment."}
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void detail.refetch()}
                >
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <span className="mb-5 flex size-12 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
                <SparkleIcon className="size-6" aria-hidden="true" />
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">
                What are you building?
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                Pitch your idea in your own words, by typing or by voice. The
                agent asks about anything it needs, then drafts the plan once it
                has enough.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <article
                key={item.key}
                className={cn(
                  "mb-9",
                  item.role === "user" && "flex justify-end",
                )}
                aria-label={
                  item.role === "user" ? "Your message" : "Planning agent"
                }
              >
                {item.role === "user" ? (
                  <div className="flex max-w-[88%] flex-col items-end gap-1">
                    <p className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-muted/80 px-5 py-3.5 text-sm leading-7">
                      {item.content}
                    </p>
                    {item.via === "voice" ? (
                      <Badge variant="outline" size="sm">
                        <MicrophoneIcon aria-hidden="true" />
                        Voice transcript
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="mb-4 flex items-center gap-2.5">
                      <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <SparkleIcon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-semibold">
                        Planning agent
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
                      {item.content}
                    </p>
                    {item.questions.length > 0 ? (
                      <ul className="mt-4 space-y-2 text-sm leading-6 text-foreground/90">
                        {item.questions.map((question) => (
                          <li key={question.text} className="flex gap-2">
                            <span
                              aria-hidden="true"
                              className="text-muted-foreground"
                            >
                              •
                            </span>
                            <span className="min-w-0 break-words">
                              {question.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.key === lastProduced && workingDocument ? (
                      <Button
                        variant="outline"
                        className="mt-6 h-auto w-full max-w-sm justify-start gap-3 whitespace-normal p-3.5 text-left sm:h-auto"
                        onClick={onOpenDraft}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                          <FileTextIcon
                            className="size-5 text-primary"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {workingDocument.title}
                          </span>
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            Working document · {workingDocument.label}
                          </span>
                        </span>
                      </Button>
                    ) : null}
                  </div>
                )}
              </article>
            ))
          )}
          {showTyping(ui) ? (
            <div
              role="status"
              className="mb-9 flex items-center gap-1.5 text-muted-foreground"
            >
              <span className="sr-only">The planning agent is thinking</span>
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  aria-hidden="true"
                  style={{ animationDelay: `${delay}ms` }}
                  className="size-1.5 animate-pulse rounded-full bg-current"
                />
              ))}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-2xl">
          {showStrip ? (
            <ChecklistStrip checklist={conversation?.checklist ?? []} />
          ) : null}
          {ui.status === "error" && ui.error ? (
            <TurnAlert
              kind={ui.error.kind}
              message={errorText(ui.error.kind, ui.error.message)}
              onRetry={retry}
              onDismiss={() => dispatch({ type: "dismiss" })}
            />
          ) : null}
          {voiceError ? (
            <Alert variant="warning" className="mb-3">
              <WarningCircleIcon aria-hidden="true" />
              <AlertDescription>{voiceError}</AlertDescription>
            </Alert>
          ) : null}
          {showConfirmButton(phase, ui) ? (
            <div className="mb-3">
              <Button onClick={() => send(CONFIRM_TEXT)}>
                Yes, generate the document
              </Button>
            </div>
          ) : null}
          {questions.some((q) => q.suggestion) ? (
            <div
              className="mb-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Suggested answers"
            >
              {questions
                .filter((q) => q.suggestion)
                .map((q) => (
                  <Button
                    key={q.text}
                    size="sm"
                    variant="outline"
                    title={q.text}
                    className="h-auto max-w-full whitespace-normal py-1.5 text-left text-xs sm:h-auto"
                    onClick={() => {
                      setDraft(q.suggestion ?? "");
                      composer.current?.focus();
                    }}
                  >
                    {q.suggestion}
                  </Button>
                ))}
            </div>
          ) : null}
          {phase === "generated" ? (
            <p className="mb-2 px-1 text-xs text-muted-foreground">
              Ask for a change, such as &ldquo;add a risk about stale
              data&rdquo;, or say &ldquo;undo that&rdquo;. Each change is saved,
              and you publish a version when you are ready.
            </p>
          ) : null}
          <form
            className="rounded-2xl border bg-background p-3 shadow-[0_2px_12px_rgb(0_0_0/3%)] focus-within:border-ring/40"
            onSubmit={submit}
          >
            <Label
              htmlFor={composerId}
              className="mb-1 px-2 text-[11px] font-medium text-muted-foreground sm:text-[11px]"
            >
              Message the planning agent
            </Label>
            <Textarea
              unstyled
              ref={composer}
              id={composerId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                recording
                  ? "Listening…"
                  : phase === "generated"
                    ? "Ask for a change to the document…"
                    : "Describe your idea, or answer the agent…"
              }
              className="min-h-16 max-h-40 border-0 bg-transparent shadow-none focus-within:ring-0"
              rows={2}
              maxLength={8000}
              disabled={busy}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {voiceSupported ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant={recording ? "destructive" : "ghost"}
                          size="icon-sm"
                          aria-label={
                            recording
                              ? "Stop recording"
                              : "Record a voice message"
                          }
                          aria-pressed={recording}
                          disabled={busy || transcribing}
                          loading={transcribing}
                          onClick={() =>
                            recording ? recorder.stop() : void recorder.start()
                          }
                        />
                      }
                    >
                      {recording ? (
                        <SquareIcon weight="fill" aria-hidden="true" />
                      ) : (
                        <MicrophoneIcon aria-hidden="true" />
                      )}
                    </TooltipTrigger>
                    <TooltipPopup>
                      {recording ? "Stop recording" : "Record a voice message"}
                    </TooltipPopup>
                  </Tooltip>
                ) : null}
                {voiceSupported ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            speakReplies
                              ? "Turn off spoken replies"
                              : "Turn on spoken replies"
                          }
                          aria-pressed={speakReplies}
                          onClick={() => {
                            if (speakReplies) playback.stop();
                            setSpeakReplies(!speakReplies);
                          }}
                        />
                      }
                    >
                      {speakReplies ? (
                        <SpeakerHighIcon aria-hidden="true" />
                      ) : (
                        <SpeakerSlashIcon aria-hidden="true" />
                      )}
                    </TooltipTrigger>
                    <TooltipPopup>
                      {speakReplies
                        ? "Turn off spoken replies"
                        : "Turn on spoken replies"}
                    </TooltipPopup>
                  </Tooltip>
                ) : null}
                {playback.status === "playing" ||
                playback.status === "loading" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={playback.stop}
                  >
                    {playback.status === "loading"
                      ? "Cancel voice"
                      : "Stop voice"}
                  </Button>
                ) : null}
                {playback.status === "blocked" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void playback.resume()}
                  >
                    Play reply
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-[10px] text-muted-foreground sm:block">
                  Planning agent
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="submit"
                        size="icon"
                        aria-label="Send message"
                        disabled={busy || !draft.trim()}
                        loading={busy}
                      />
                    }
                  >
                    <ArrowUpIcon weight="bold" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipPopup>Send message</TooltipPopup>
                </Tooltip>
              </div>
            </div>
          </form>
          <p className="mt-2.5 text-center text-[10px] text-muted-foreground">
            Messages go to an AI model to draft your plan. Voice is processed by
            a speech provider.
          </p>
        </div>
      </div>
    </div>
  );
}

function TurnAlert({
  kind,
  message,
  onRetry,
  onDismiss,
}: {
  kind: "auth" | "config" | "conflict" | "missing" | "other";
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (kind === "auth") {
    return (
      <Alert variant="info" className="mb-3">
        <InfoIcon aria-hidden="true" />
        <AlertDescription>{message}</AlertDescription>
        <AlertAction>
          <Button size="sm" render={<a href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  return (
    <Alert variant="error" className="mb-3">
      <WarningCircleIcon aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  );
}
