"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  CheckIcon,
  FileTextIcon,
  SquareIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

const starters = [
  "What problem are we solving?",
  "Define the scope and non-goals",
  "Challenge the tradeoffs",
];
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal?: string;
  decision?: "accepted" | "dismissed";
};

export function PlanningSession({
  title,
  onOpenDocument,
  onAccept,
  readOnly,
  pending,
}: {
  title: string;
  onOpenDocument: () => void;
  onAccept: (content: string) => Promise<unknown>;
  readOnly: boolean;
  pending: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, running]);

  function send(prompt = draft.trim()) {
    if (!prompt || running) return;
    setDraft("");
    setStopped(false);
    setRunning(true);
    setMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), role: "user", text: prompt },
    ]);
    timer.current = setTimeout(() => {
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: [
            "Who needs this, and what would success look like? What has to change for them?",
            "What is out of scope? Which constraints are firm, and where can the implementer choose?",
            "What happens when this fails? Which tradeoffs still need the team’s agreement?",
          ][items.filter((item) => item.role === "assistant").length % 3],
          proposal: `## ${["Problem and goals", "Scope and constraints", "Risks and open questions"][items.filter((item) => item.role === "assistant").length % 3]}\n${prompt}`,
        },
      ]);
      setRunning(false);
      timer.current = null;
    }, 1200);
  }
  async function decide(message: Message, decision: "accepted" | "dismissed") {
    if (decision === "accepted" && message.proposal) {
      setAcceptError(null);
      setAccepting(message.id);
      try {
        await onAccept(message.proposal);
      } catch (error) {
        setAcceptError(
          error instanceof Error
            ? error.message
            : "Could not update document. Try again.",
        );
        return;
      } finally {
        setAccepting(null);
      }
    }
    setMessages((items) =>
      items.map((item) =>
        item.id === message.id ? { ...item, decision } : item,
      ),
    );
  }

  return (
    <section className="planning-session" aria-label="Planning session">
      <div
        className="planning-messages"
        role="log"
        aria-label="Planning conversation"
        aria-live="polite"
      >
        <div className="planning-intro">
          <p>
            Tell me about “{title}”. What are you trying to build or change?
            Let’s work through it.
          </p>
          {!messages.length && (
            <div className="planning-starters">
              {starters.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
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
        {messages.map((message) => (
          <div
            key={message.id}
            className={`planning-message planning-message-${message.role}`}
          >
            <p>{message.text}</p>
            {message.proposal && (
              <div className="planning-proposal">
                <div className="planning-proposal-label">
                  <FileTextIcon aria-hidden="true" /> Proposed addition{" "}
                </div>
                <p>{message.proposal}</p>
                <div className="planning-proposal-actions">
                  {message.decision ? (
                    <>
                      <span>
                        <CheckIcon aria-hidden="true" />
                        {message.decision === "accepted"
                          ? "Added to draft"
                          : "Dismissed"}
                      </span>
                      {message.decision === "accepted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={onOpenDocument}
                        >
                          View document
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={readOnly || pending || Boolean(accepting)}
                        loading={accepting === message.id}
                        onClick={() => decide(message, "accepted")}
                      >
                        <CheckIcon aria-hidden="true" /> Add to draft
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(accepting)}
                        onClick={() => decide(message, "dismissed")}
                      >
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {running && (
          <div
            className="planning-activity"
            role="status"
            aria-label="Preparing response"
          >
            <Spinner className="size-3.5" />
          </div>
        )}
        {stopped && (
          <p className="planning-stopped" role="status">
            Response stopped.
          </p>
        )}
        <div ref={end} />
      </div>
      <div className="planning-composer-wrap">
        {acceptError && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {acceptError}
          </p>
        )}
        {readOnly && (
          <p className="planning-read-only">
            Viewing a bound version. Return to the draft to accept additions.
          </p>
        )}
        <form
          className="planning-composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Textarea
            unstyled
            ref={composer}
            aria-label="Message planning agent"
            placeholder="Talk through your decision…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div>
            {running ? (
              <Button
                size="icon-sm"
                variant="secondary"
                aria-label="Stop response"
                onClick={() => {
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = null;
                  setRunning(false);
                  setStopped(true);
                }}
              >
                <SquareIcon weight="fill" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Send message"
                disabled={!draft.trim()}
              >
                <ArrowUpIcon weight="bold" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
