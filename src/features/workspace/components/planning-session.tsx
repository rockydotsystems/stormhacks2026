"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowUpIcon,
  MoonIcon,
  SparkleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { WaveformIcon } from "@phosphor-icons/react/dist/csr/Waveform";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  formatAnswers,
  pairAnswers,
  parseAnswers,
  type Answer,
} from "@/features/planning/client/answers";
import { useSession } from "@/features/auth/client/queries";
import { PlanningApiError } from "@/features/planning/client/api";
import { authorHue, initials, nameList } from "@/features/planning/client/live";
import { useLiveConversation } from "@/features/planning/client/use-live-conversation";
import {
  useApplyStandby,
  useConversation,
  useDocumentConversation,
  useSendMessage,
} from "@/features/planning/client/queries";
import {
  GENERATE_TEXT,
  activeQuestions,
  allTopicsCovered,
  chatItems,
  errorText,
  initialTurnUi,
  isBusy,
  showTyping,
  turnReducer,
  type PendingTurn,
} from "@/features/planning/client/state";
import { ChecklistStrip } from "@/features/planning/components/checklist-strip";
import { TurnAlert } from "@/features/planning/components/turn-alert";
import { QuestionPrompt } from "@/features/planning/components/question-prompt";
import { ReasoningBlock } from "@/features/planning/components/reasoning-block";
import { VoiceConversation } from "@/features/planning/components/voice-conversation";
import type { Question } from "@/features/planning/contracts";

const starters = [
  "What problem are we solving?",
  "Define the scope and non-goals",
  "Challenge the tradeoffs",
];

/**
 * The planning chat for one document, on the real planning agent. The agent interviews the user
 * with staged questions, then writes the first draft into the document, and edits it from chat
 * afterwards. Replies and the model's reasoning stream in as they are written.
 */
export function PlanningSession({
  title,
  documentId,
  organizationId,
  onOpenDocument,
  onDocumentChanged,
}: {
  title: string;
  documentId: string;
  projectId?: string | null;
  organizationId: string;
  onOpenDocument: () => void;
  // The document changed on the server, so the page should load it again.
  onDocumentChanged: () => void;
}) {
  const binding = useDocumentConversation({
    documentId,
    organizationId,
    title,
  });
  const conversationId = binding.data?.id ?? null;
  const detail = useConversation(conversationId);
  const sendMessage = useSendMessage();
  const [ui, dispatch] = useReducer(turnReducer, initialTurnUi);
  const [draft, setDraft] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  // The assistant message whose questions the user closed to answer in the chat instead.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const conversation = detail.data ?? binding.data;
  // Other people can share this chat. Their messages show on the left under their name, and the
  // agent goes quiet while two or more of them are here.
  const viewerId = useSession().data?.user?.id ?? null;
  const standby = conversation?.mode === "standby";
  const participants = conversation?.participants ?? [];
  const names = new Map(participants.map((p) => [p.userId, p.displayName]));
  const live = useLiveConversation({
    conversationId,
    mode: conversation?.mode,
    shared: participants.length > 1,
  });
  const applyStandby = useApplyStandby(conversationId ?? "");
  const messages = conversation?.messages ?? [];
  const phase = conversation?.phase ?? "grilling";
  const items = chatItems(messages, ui);
  const questions = activeQuestions(messages, ui);
  const lastAssistant = messages.findLast(
    (m) => m.role === "assistant" && m.kind === "chat",
  );
  const busy = isBusy(ui);
  const popupOpen =
    questions.length > 0 &&
    lastAssistant?.id !== closedFor &&
    !busy &&
    !voiceOpen &&
    !standby;
  const loading = binding.isPending || (conversationId && detail.isPending);
  const loadError = binding.error ?? detail.error;
  const workingDocument = conversation?.workingDocument;

  // A teammate's change, or one made while this tab was in the background, reaches the page
  // through the conversation. The page's own copy of the document must follow it, or the
  // history would lag behind what the chat shows.
  const workingChangeId = workingDocument?.changeId ?? null;
  const seenChangeId = useRef<string | null>(null);
  useEffect(() => {
    if (workingChangeId === null) return;
    if (
      seenChangeId.current !== null &&
      seenChangeId.current !== workingChangeId
    )
      onDocumentChanged();
    seenChangeId.current = workingChangeId;
  }, [workingChangeId, onDocumentChanged]);

  async function run(turn: PendingTurn) {
    if (!conversationId) return null;
    try {
      const final = await sendMessage.mutateAsync({
        conversationId,
        input: {
          text: turn.text,
          via: turn.via,
          clientMessageId: turn.clientMessageId,
        },
        onReasoning: (text) => dispatch({ type: "reasoning", text }),
        onDelta: (text) => dispatch({ type: "delta", text }),
        onDocumentChanged: (event) => {
          onDocumentChanged();
          if (event.change.source?.mode === "generated") onOpenDocument();
        },
      });
      dispatch({ type: "succeeded" });
      // In standby the agent says nothing, so there is no reply to read out.
      if (!final.assistantMessage) return null;
      return [
        final.assistantMessage.content,
        ...(final.assistantMessage.questions ?? []).map(
          (question) => question.text,
        ),
      ].join("\n\n");
    } catch (caught) {
      const error = caught instanceof PlanningApiError ? caught : null;
      dispatch({
        type: "failed",
        kind: error?.kind ?? "other",
        message: error?.message ?? "Something went wrong. Please try again.",
      });
      return null;
    }
  }

  async function send(text: string, via: "text" | "voice" = "text") {
    if (busy || !conversationId || !text.trim()) return null;
    const turn: PendingTurn = {
      clientMessageId: crypto.randomUUID(),
      text,
      via,
      speak: false,
    };
    dispatch({ type: "send", turn });
    return run(turn);
  }

  function retry() {
    if (ui.status !== "error" || !ui.pending) return;
    dispatch({ type: "retry" });
    void run(ui.pending);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || busy || !conversationId) return;
    send(draft.trim());
    setDraft("");
  }

  function submitAnswers(answers: Answer[]) {
    send(formatAnswers(answers));
  }

  // Once every recommended topic is covered there is nothing left to ask, so write the document.
  const autoFired = useRef<string | null>(null);
  const coveredAll =
    conversation && phase !== "generated"
      ? allTopicsCovered(conversation.checklist)
      : false;
  useEffect(() => {
    if (
      !coveredAll ||
      busy ||
      voiceOpen ||
      !conversationId ||
      standby ||
      ui.status !== "idle"
    )
      return;
    if (autoFired.current === conversationId) return;
    autoFired.current = conversationId;
    send(GENERATE_TEXT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coveredAll, busy, voiceOpen, standby, conversationId, ui.status]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [
    items.length,
    ui.streamText,
    ui.reasoningText,
    ui.status,
    popupOpen,
    voiceOpen,
  ]);

  // Each assistant message may carry questions, which the answers message refers to by number.
  function questionsBefore(index: number): Question[] {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (items[i].role === "assistant" && items[i].kind === "chat")
        return items[i].questions;
    }
    return [];
  }

  const lastAssistantKey = items.findLast(
    (item) => item.role === "assistant" && item.kind === "chat",
  )?.key;
  const thinking = busy && showTyping(ui);
  // The generate message starts the first draft, which takes much longer than a normal reply.
  const drafting = busy && ui.pending?.text === GENERATE_TEXT;

  function returnToTranscript() {
    setVoiceOpen(false);
    requestAnimationFrame(() => {
      if (composer.current?.disabled) end.current?.parentElement?.focus();
      else composer.current?.focus();
    });
  }

  return (
    <section className="planning-session" aria-label="Planning session">
      <div
        className="planning-messages"
        role="log"
        tabIndex={-1}
        aria-label="Planning conversation"
        aria-live="polite"
      >
        <div className="planning-intro">
          <p>
            Tell me about “{title}”. What are you trying to build or change?
            Let’s work through it.
          </p>
          {!items.length && !loading && (
            <div className="planning-starters">
              {starters.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  disabled={!conversationId}
                  onClick={() => {
                    setDraft(prompt);
                    composer.current?.focus();
                  }}
                >
                  {prompt}
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="planning-activity" role="status" aria-label="Loading">
            <Spinner className="size-3.5" />
          </div>
        ) : null}
        {loadError ? (
          <TurnAlert
            kind={
              loadError instanceof PlanningApiError ? loadError.kind : "other"
            }
            message={errorText(
              loadError instanceof PlanningApiError ? loadError.kind : "other",
              loadError.message,
            )}
            onRetry={() => {
              void binding.refetch();
              if (conversationId) void detail.refetch();
            }}
            onDismiss={() => undefined}
          />
        ) : null}

        {items.map((item, index) => {
          if (item.kind !== "chat") {
            return (
              <div key={item.key} className="planning-notice" role="status">
                <MoonIcon weight="fill" aria-hidden="true" />
                <span>{item.content}</span>
              </div>
            );
          }
          const author = item.authorUserId;
          if (
            item.role === "user" &&
            author !== null &&
            viewerId !== null &&
            author !== viewerId
          ) {
            const name = names.get(author) || "Teammate";
            return (
              <div
                key={item.key}
                className="planning-message planning-message-teammate"
                style={{ "--hue": authorHue(author) } as CSSProperties}
              >
                <div className="planning-author">
                  <span className="planning-avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <strong>{name}</strong>
                </div>
                <p>{item.content}</p>
              </div>
            );
          }
          const answers =
            item.role === "user" ? parseAnswers(item.content) : null;
          const pairs = answers
            ? pairAnswers(questionsBefore(index), answers)
            : [];
          return (
            <div
              key={item.key}
              className={`planning-message planning-message-${item.role}`}
            >
              {item.role === "assistant" ? (
                <>
                  {item.key === lastAssistantKey && !busy ? (
                    <ReasoningBlock text={ui.reasoningText} live={false} />
                  ) : null}
                  <p>{item.content}</p>
                  {item.questions.length > 0 &&
                  item.key === lastAssistantKey &&
                  !popupOpen &&
                  !busy ? (
                    <ol className="planning-asked">
                      {item.questions.map((question) => (
                        <li key={question.text}>{question.text}</li>
                      ))}
                    </ol>
                  ) : null}
                </>
              ) : pairs.length > 0 ? (
                <ul className="planning-answers" aria-label="Your answers">
                  {pairs.map((pair) => (
                    <li key={pair.question}>
                      <span>{pair.question}</span>
                      <strong data-skipped={pair.skipped || undefined}>
                        {pair.skipped ? "Skipped" : pair.answer}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{item.content}</p>
              )}
            </div>
          );
        })}

        {busy ? (
          <div className="planning-message planning-message-assistant">
            <ReasoningBlock text={ui.reasoningText} live={thinking} />
            {drafting ? (
              <div
                className="planning-drafting"
                role="status"
                aria-label="Writing the document"
              >
                <Spinner className="size-3.5" />
                <span>
                  <strong>Writing your document…</strong>
                  <small>
                    This can take a minute. It opens here when it is ready.
                  </small>
                </span>
              </div>
            ) : thinking && !ui.reasoningText ? (
              <div
                className="planning-activity"
                role="status"
                aria-label="Preparing response"
              >
                <Spinner className="size-3.5" />
              </div>
            ) : null}
          </div>
        ) : null}
        <div ref={end} />
      </div>

      <div className="planning-composer-wrap">
        {ui.status === "error" && ui.error ? (
          <TurnAlert
            kind={ui.error.kind}
            message={errorText(ui.error.kind, ui.error.message)}
            onRetry={retry}
            onDismiss={() => dispatch({ type: "dismiss" })}
          />
        ) : null}
        {participants.length > 1 && live.users.length > 0 ? (
          <div
            className="planning-presence"
            role="status"
            aria-label="People in this chat"
          >
            <span className="planning-avatars" aria-hidden="true">
              {live.users.map((user) => (
                <span
                  key={user.userId}
                  className="planning-avatar"
                  style={{ "--hue": authorHue(user.userId) } as CSSProperties}
                >
                  {initials(user.displayName)}
                </span>
              ))}
            </span>
            <span>
              {nameList(live.users.map((user) => user.displayName))}{" "}
              {live.users.length === 1 ? "is" : "are"} here
            </span>
          </div>
        ) : null}
        {conversation?.pendingGate ? (
          <div className="planning-standby" role="status">
            <WarningIcon weight="fill" aria-hidden="true" />
            <span>
              <strong>
                {conversation.pendingGate.kind === "goal"
                  ? "Goal change on hold"
                  : "Change of direction on hold"}
              </strong>
              <small>{conversation.pendingGate.summary}</small>
              <small>
                Confirm you have seen the earlier discussion and say why you
                want this, or drop it.
              </small>
            </span>
          </div>
        ) : null}
        {standby ? (
          <div className="planning-standby" role="status">
            <MoonIcon weight="fill" aria-hidden="true" />
            <span>
              <strong>Standby mode</strong>
              <small>
                The agent is listening and will update the document once you
                agree.
              </small>
              {applyStandby.error ? (
                <small data-error="true">{applyStandby.error.message}</small>
              ) : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || applyStandby.isPending || !conversationId}
              onClick={() => applyStandby.mutate()}
            >
              {applyStandby.isPending ? "Applying…" : "Apply now"}
            </Button>
          </div>
        ) : null}
        {conversation && phase !== "generated" && items.length > 0 ? (
          <ChecklistStrip checklist={conversation.checklist}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !conversationId || standby}
              onClick={() => send(GENERATE_TEXT)}
            >
              <SparkleIcon aria-hidden="true" /> Skip ahead &amp; draft
            </Button>
          </ChecklistStrip>
        ) : null}
        {popupOpen && lastAssistant ? (
          <QuestionPrompt
            key={lastAssistant.id}
            questions={questions}
            onSubmit={submitAnswers}
            onDismiss={() => {
              setClosedFor(lastAssistant.id);
              composer.current?.focus();
            }}
          />
        ) : null}
        {voiceOpen && !standby ? (
          <VoiceConversation
            onTurn={(text) => send(text, "voice")}
            onEnd={returnToTranscript}
            busy={busy}
          />
        ) : (
          <form className="planning-composer" onSubmit={submit}>
            <Textarea
              unstyled
              ref={composer}
              aria-label="Message planning agent"
              placeholder={
                standby
                  ? "Talk it through with your team…"
                  : phase === "generated"
                    ? "Ask for a change to the document…"
                    : "Describe your idea, or answer the agent…"
              }
              value={draft}
              maxLength={8000}
              disabled={busy || !conversationId}
              onChange={(event) => setDraft(event.target.value)}
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
            <div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="voice-trigger"
                disabled={
                  busy || !conversationId || ui.status === "error" || standby
                }
                aria-label="Use voice in this chat"
                title={
                  standby
                    ? "Voice is off while the team is talking"
                    : "Talk to the AI"
                }
                onClick={() => setVoiceOpen(true)}
              >
                <WaveformIcon aria-hidden="true" />
              </Button>
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Send message"
                disabled={!draft.trim() || busy || !conversationId}
              >
                <ArrowUpIcon weight="bold" aria-hidden="true" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
