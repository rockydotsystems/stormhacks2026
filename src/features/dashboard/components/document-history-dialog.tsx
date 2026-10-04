"use client";

import { Suspense, lazy, useMemo, useState } from "react";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { PlanningApiError } from "@/features/planning/client/api";
import {
  useChangeSource,
  useDocumentConversation,
  useVersionSource,
} from "@/features/planning/client/queries";
import { pairAnswers, parseAnswers } from "@/features/planning/client/answers";
import type { Question } from "@/features/planning/contracts";
import type { MessageDto } from "@/features/planning/session-contracts";
import type { DocChange } from "@/features/docs/contracts";
import type { DocumentData } from "../contracts";
import { diffLines, diffStats } from "../lib/diff";
import {
  historyEntries,
  previousChange,
  type HistoryEntry,
} from "../lib/history";

type Scope = "versions" | "changes";
type View = "diff" | "raw" | "conversation";

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Read-only history of one document. The sidebar lists versions or the changes inside the
 * selected version, newest first. The main pane shows the difference from what came before,
 * the raw text, or the conversation that led to it.
 */
export function DocumentHistoryDialog({
  open,
  onOpenChange,
  data,
  documentId,
  organizationId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DocumentData;
  documentId: string;
  organizationId: string;
  title: string;
}) {
  const entries = useMemo(() => historyEntries(data), [data]);
  const [scope, setScope] = useState<Scope>("versions");
  const [view, setView] = useState<View>("diff");
  const [entryKey, setEntryKey] = useState<HistoryEntry["key"] | null>(null);
  const [changeId, setChangeId] = useState<string | null>(null);

  const entry = entries.find((item) => item.key === entryKey) ?? entries[0];
  // The Changes tab lists every change in the document's history, whatever version it is in.
  const changes = useMemo(() => data.changes.toReversed(), [data.changes]);
  const change =
    scope === "changes"
      ? (changes.find((item) => item.id === changeId) ?? changes[0] ?? null)
      : null;
  const versionOf = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of entries)
      for (const inner of item.changes) labels.set(inner.id, item.label);
    return labels;
  }, [entries]);

  // What the main pane shows, and what it is compared with.
  const head = scope === "versions" ? (entry?.head ?? null) : change;
  const base =
    scope === "versions"
      ? (entry?.base ?? null)
      : change
        ? previousChange(data, change)
        : null;

  const conversation = useDocumentConversation({
    documentId,
    organizationId,
    title,
  });
  const conversationId = conversation.data?.id ?? null;
  const changeSource = useChangeSource(
    conversationId,
    open && scope === "changes" && view === "conversation"
      ? (change?.id ?? null)
      : null,
  );
  const versionSource = useVersionSource(
    conversationId,
    entry ? entry.key : null,
    open && scope === "versions" && view === "conversation",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="h-[min(46rem,calc(100dvh-2rem))] max-w-5xl">
        <DialogHeader>
          <DialogTitle>Document history</DialogTitle>
          <DialogDescription>
            Look back at published versions, the changes inside each one, and
            the conversation behind them.
          </DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Nothing has been saved yet.
          </p>
        ) : (
          <div className="history-body">
            <aside className="history-sidebar" aria-label="History">
              <Tabs
                value={scope}
                onValueChange={(value) => setScope(value as Scope)}
              >
                <TabsList className="w-full">
                  <TabsTab value="versions">Versions</TabsTab>
                  <TabsTab value="changes">Changes</TabsTab>
                </TabsList>
              </Tabs>
              <ul className="history-list">
                {scope === "versions"
                  ? entries.map((item) => (
                      <li key={String(item.key)}>
                        <button
                          type="button"
                          data-active={item.key === entry.key || undefined}
                          onClick={() => {
                            setEntryKey(item.key);
                            setChangeId(null);
                          }}
                        >
                          <span className="history-item-title">
                            {item.label}
                            {item.version ? (
                              <Badge variant="success" size="sm">
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="secondary" size="sm">
                                Unpublished
                              </Badge>
                            )}
                          </span>
                          <small>
                            {item.head?.title ?? "Untitled"} ·{" "}
                            {item.changes.length}{" "}
                            {item.changes.length === 1 ? "change" : "changes"}
                          </small>
                          <small>
                            {item.version
                              ? when(item.version.publishedAt)
                              : item.head
                                ? when(item.head.createdAt)
                                : ""}
                          </small>
                        </button>
                      </li>
                    ))
                  : changes.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          data-active={item.id === change?.id || undefined}
                          onClick={() => setChangeId(item.id)}
                        >
                          <span className="history-item-title">
                            Change {item.number}
                            <Badge
                              variant={
                                versionOf.get(item.id) === "Draft"
                                  ? "secondary"
                                  : "success"
                              }
                              size="sm"
                            >
                              {versionOf.get(item.id) ?? "Draft"}
                            </Badge>
                          </span>
                          <small>{item.title}</small>
                          <small>{when(item.createdAt)}</small>
                        </button>
                      </li>
                    ))}
              </ul>
            </aside>

            <section className="history-main" aria-label="Selected history">
              <div className="history-main-head">
                <p>
                  {scope === "versions"
                    ? `${entry.label}${entry.version ? "" : " (not published)"}`
                    : change
                      ? `Change ${change.number}`
                      : "No change selected"}
                </p>
                <Tabs
                  value={view}
                  onValueChange={(value) => setView(value as View)}
                >
                  <TabsList>
                    <TabsTab value="diff">Diff</TabsTab>
                    <TabsTab value="raw">Raw</TabsTab>
                    <TabsTab value="conversation">Conversation</TabsTab>
                  </TabsList>
                </Tabs>
              </div>
              <div className="history-pane">
                {!head ? (
                  <p className="history-empty">Nothing to show here.</p>
                ) : view === "raw" ? (
                  <RawPane content={head.content} />
                ) : view === "diff" ? (
                  <DiffPane head={head} base={base} />
                ) : scope === "versions" ? (
                  <ConversationPane
                    loading={versionSource.isPending}
                    error={versionSource.error}
                    messages={versionSource.data?.messages ?? []}
                    emptyText="No conversation was recorded for the changes in this version."
                  />
                ) : (
                  <ConversationPane
                    loading={changeSource.isPending && Boolean(change)}
                    error={changeSource.error}
                    messages={changeSource.data?.messages ?? []}
                    emptyText="No conversation was recorded for this change. It was saved from the editor."
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </DialogPopup>
    </Dialog>
  );
}

// The viewer brings in a syntax highlighter, so it loads only when the dialog needs it.
const DiffView = lazy(() =>
  import("./history-code").then((module) => ({ default: module.DiffView })),
);
const RawView = lazy(() =>
  import("./history-code").then((module) => ({ default: module.RawView })),
);

function CodeFallback() {
  return (
    <div className="history-empty" role="status">
      <Spinner className="size-3.5" />
    </div>
  );
}

function RawPane({ content }: { content: string }) {
  return (
    <Suspense fallback={<CodeFallback />}>
      <RawView content={content} />
    </Suspense>
  );
}

function DiffPane({ head, base }: { head: DocChange; base: DocChange | null }) {
  const before = base?.content ?? "";
  const { added, removed } = useMemo(
    () => diffStats(diffLines(before, head.content)),
    [before, head.content],
  );
  return (
    <>
      <p className="history-stats">
        <span className="history-added">+{added}</span>
        <span className="history-removed">−{removed}</span>
      </p>
      {added === 0 && removed === 0 ? (
        <p className="history-empty">No changes to the text.</p>
      ) : (
        <Suspense fallback={<CodeFallback />}>
          <DiffView before={before} after={head.content} />
        </Suspense>
      )}
    </>
  );
}

// The conversation as it happened: your messages and the agent's replies, in order.
function ConversationPane({
  loading,
  error,
  messages,
  emptyText,
}: {
  loading: boolean;
  error: Error | null;
  messages: MessageDto[];
  emptyText: string;
}) {
  if (loading)
    return (
      <div className="history-empty" role="status">
        <Spinner className="size-3.5" />
      </div>
    );
  if (error) {
    // A change saved from the editor has no conversation. That is not a failure.
    if (error instanceof PlanningApiError && error.kind === "missing")
      return <p className="history-empty">{emptyText}</p>;
    return (
      <p className="history-empty text-destructive" role="alert">
        {error.message}
      </p>
    );
  }
  if (messages.length === 0)
    return <p className="history-empty">{emptyText}</p>;
  // Answers to the agent's questions refer to them by number, so look back for the questions.
  function questionsBefore(index: number): Question[] {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].questions ?? [];
    }
    return [];
  }
  return (
    <div className="history-messages">
      {messages.map((message, index) => {
        const answers =
          message.role === "user" ? parseAnswers(message.content) : null;
        const pairs = answers
          ? pairAnswers(questionsBefore(index), answers)
          : [];
        return (
          <div
            key={message.id}
            className={`planning-message planning-message-${message.role}`}
          >
            {pairs.length > 0 ? (
              <ul className="planning-answers" aria-label="Answers">
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
              <p>{message.content}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
