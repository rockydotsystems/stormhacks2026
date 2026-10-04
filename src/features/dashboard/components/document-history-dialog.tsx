"use client";

import { useMemo, useState } from "react";
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
import type { MessageDto } from "@/features/planning/session-contracts";
import type { DocChange } from "@/features/docs/contracts";
import { cn } from "@/lib/utils";
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

const MODE_TEXT = {
  generated: "Drafted by the agent",
  edited: "Edited by the agent",
  reverted: "Restored an earlier change",
} as const;

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
  const changes = entry ? entry.changes.toReversed() : [];
  const change =
    scope === "changes"
      ? (changes.find((item) => item.id === changeId) ?? changes[0] ?? null)
      : null;

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
              {scope === "changes" ? (
                <p className="history-scope">
                  Changes in <strong>{entry.label}</strong>. Pick another
                  version under Versions.
                </p>
              ) : null}
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
                      ? `Change ${change.number} in ${entry.label}`
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
                  <pre className="history-raw">{head.content}</pre>
                ) : view === "diff" ? (
                  <DiffPane
                    head={head}
                    base={base}
                    baseLabel={
                      scope === "versions"
                        ? entry.base
                          ? "the previous version"
                          : null
                        : base
                          ? `change ${base.number}`
                          : null
                    }
                  />
                ) : scope === "versions" ? (
                  <ConversationPane
                    loading={versionSource.isPending}
                    error={versionSource.error}
                    messages={versionSource.data?.messages ?? []}
                    summary={
                      versionSource.data
                        ? summarize(versionSource.data.changes)
                        : null
                    }
                    emptyText="No conversation was recorded for the changes in this version."
                  />
                ) : (
                  <ConversationPane
                    loading={changeSource.isPending && Boolean(change)}
                    error={changeSource.error}
                    messages={changeSource.data?.messages ?? []}
                    summary={
                      changeSource.data
                        ? MODE_TEXT[changeSource.data.mode]
                        : null
                    }
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

function summarize(changes: { mode: keyof typeof MODE_TEXT }[]) {
  const counts = { generated: 0, edited: 0, reverted: 0 };
  for (const item of changes) counts[item.mode] += 1;
  const parts = [
    counts.generated ? `${counts.generated} drafted` : "",
    counts.edited ? `${counts.edited} edited` : "",
    counts.reverted ? `${counts.reverted} restored` : "",
  ].filter(Boolean);
  return `${changes.length} ${changes.length === 1 ? "change" : "changes"} by the agent (${parts.join(", ")})`;
}

function DiffPane({
  head,
  base,
  baseLabel,
}: {
  head: DocChange;
  base: DocChange | null;
  baseLabel: string | null;
}) {
  const diff = useMemo(
    () => diffLines(base?.content ?? "", head.content),
    [base, head],
  );
  const { added, removed } = diffStats(diff);
  return (
    <>
      <p className="history-compare">
        {baseLabel ? `Compared with ${baseLabel}.` : "Everything here is new."}{" "}
        <span className="history-added">+{added}</span>{" "}
        <span className="history-removed">−{removed}</span>
      </p>
      {added === 0 && removed === 0 ? (
        <p className="history-empty">No changes to the text.</p>
      ) : (
        <div className="history-diff" role="table" aria-label="Text changes">
          {diff.map((line, index) => (
            <div
              key={index}
              role="row"
              className={cn("history-diff-line")}
              data-kind={line.kind}
            >
              <span aria-hidden="true">
                {line.kind === "added"
                  ? "+"
                  : line.kind === "removed"
                    ? "−"
                    : ""}
              </span>
              <code role="cell">{line.text || " "}</code>
              <span className="sr-only">
                {line.kind === "added"
                  ? "Added"
                  : line.kind === "removed"
                    ? "Removed"
                    : "Unchanged"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ConversationPane({
  loading,
  error,
  messages,
  summary,
  emptyText,
}: {
  loading: boolean;
  error: Error | null;
  messages: MessageDto[];
  summary: string | null;
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
  const mine = messages.filter((message) => message.role === "user").length;
  return (
    <>
      <p className="history-compare">
        {summary ? `${summary}. ` : ""}
        {mine} from you, {messages.length - mine} from the agent.
      </p>
      <ol className="history-messages">
        {messages.map((message) => (
          <li key={message.id} data-role={message.role}>
            <span>
              {message.role === "user" ? "You" : "Agent"}
              {message.via === "voice" ? " (voice)" : ""}
            </span>
            <p>{message.content}</p>
            {message.producedChangeId ? (
              <small>Saved a change to the document.</small>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}
