"use client";

import {
  ArrowCounterClockwiseIcon,
  ChatCircleTextIcon,
  DownloadSimpleIcon,
  InfoIcon,
  LockSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { PlanningApiError } from "@/features/planning/client/api";
import { documentFileName } from "@/features/planning/client/markdown";
import {
  useChanges,
  useConversation,
  usePublish,
  useRevert,
  useVersion,
  useVersions,
} from "@/features/planning/client/queries";
import {
  formatWhen,
  isPublished,
  newestFirst,
  nextVersionNumber,
} from "@/features/planning/client/state";
import { ChangeSourceDialog } from "@/features/planning/components/change-source-dialog";
import { MarkdownView } from "@/features/planning/components/markdown-view";
import type { ChangeSummary } from "@/features/planning/session-contracts";
import { cn } from "@/lib/utils";

type TabValue = "document" | "history" | "versions";

const MODE_LABEL = {
  generated: "Generated",
  edited: "Edited",
  reverted: "Reverted",
} as const;

function download(title: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown" }),
  );
  const link = window.document.createElement("a");
  link.href = url;
  link.download = documentFileName(title);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function failureText(error: unknown): string {
  if (error instanceof PlanningApiError) {
    if (error.kind === "conflict") {
      return "This change is already published, or an older change cannot be published. Reload and try again.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

// The document side of a planning session: the working document, its change history, and the
// published versions. The shell gives it the aside, and it renders nothing until the
// conversation has a working document.
export function PlanningDocumentPanel({
  serverId,
  open,
  focused,
  onClose,
}: {
  serverId?: string;
  open: boolean;
  // On a narrow screen the document can take the whole width.
  focused: boolean;
  onClose: () => void;
}) {
  const detail = useConversation(serverId ?? null);
  if (!open || !serverId || !detail.data?.workingDocument) return null;
  return (
    <aside
      className={cn(
        "min-h-0 w-[min(36%,440px)] min-w-80 shrink-0 border-l bg-card/60",
        focused
          ? "max-lg:w-full max-lg:min-w-0 max-lg:border-l-0"
          : "max-lg:hidden",
      )}
    >
      <Panel conversationId={serverId} onClose={onClose} />
    </aside>
  );
}

function Panel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const detail = useConversation(conversationId);
  const [tab, setTab] = useState<TabValue>("document");
  // A published version opened read-only. Null means the working document.
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sourceFor, setSourceFor] = useState<string | null>(null);

  const working = detail.data?.workingDocument;
  const published = detail.data?.publishedDocument ?? null;
  const version = useVersion(conversationId, viewing);
  const publish = usePublish(conversationId);

  if (!working) return null;
  const next = nextVersionNumber(published?.number ?? null);
  const upToDate = isPublished(working.label);
  const shown =
    viewing !== null && version.data
      ? { title: version.data.title, content: version.data.content }
      : { title: working.title, content: working.content };

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="Planning document"
    >
      <header className="flex shrink-0 flex-col gap-2 border-b px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{working.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={viewing === null ? "secondary" : "info"}>
                {viewing === null
                  ? "Working document"
                  : `Published v${viewing}`}
              </Badge>
              <Badge variant="outline">
                {viewing === null ? working.label : "Read only"}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Download as Markdown"
                    onClick={() => download(shown.title, shown.content)}
                  />
                }
              >
                <DownloadSimpleIcon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipPopup>Download as Markdown</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Close document"
                    onClick={onClose}
                  />
                }
              >
                <XIcon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipPopup>Close document</TooltipPopup>
            </Tooltip>
          </div>
        </div>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList variant="underline" className="w-full justify-start px-3">
          <TabsTab value="document">Document</TabsTab>
          <TabsTab value="history">History</TabsTab>
          <TabsTab value="versions">Versions</TabsTab>
        </TabsList>
        <Separator />
        <TabsPanel value="document" className="flex min-h-0 flex-col">
          {viewing !== null ? (
            <div className="px-5 pt-4">
              <Alert variant="info">
                <InfoIcon aria-hidden="true" />
                <AlertDescription>
                  You are reading published v{viewing}. It is read only and
                  never changes.
                </AlertDescription>
                <AlertAction>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewing(null)}
                  >
                    Back to working document
                  </Button>
                </AlertAction>
              </Alert>
            </div>
          ) : null}
          <ScrollArea className="min-h-0 flex-1">
            <article className="px-6 py-6 sm:px-8">
              {viewing !== null && version.isPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> Loading version
                </div>
              ) : viewing !== null && version.isError ? (
                <Alert variant="error">
                  <WarningCircleIcon aria-hidden="true" />
                  <AlertDescription>
                    This version could not be loaded.
                  </AlertDescription>
                </Alert>
              ) : (
                <MarkdownView content={shown.content} />
              )}
            </article>
          </ScrollArea>
          {viewing === null ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {upToDate
                  ? `The working document matches ${working.label}. Nothing to publish.`
                  : published
                    ? `The working document is ahead of v${published.number}.`
                    : "Only you and the planning agent can see this draft. Publish it to make it the version PR and code reviews check against."}
              </p>
              <Button
                size="sm"
                disabled={upToDate}
                onClick={() => {
                  publish.reset();
                  setConfirmOpen(true);
                }}
              >
                Publish v{next}
              </Button>
            </footer>
          ) : null}
        </TabsPanel>
        <TabsPanel value="history" className="min-h-0">
          <History
            conversationId={conversationId}
            onViewSource={setSourceFor}
          />
        </TabsPanel>
        <TabsPanel value="versions" className="min-h-0">
          <Versions
            conversationId={conversationId}
            onView={(number) => {
              setViewing(number);
              setTab("document");
            }}
          />
        </TabsPanel>
      </Tabs>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish v{next}?</AlertDialogTitle>
            <AlertDialogDescription>
              v{next} becomes the official version. Reviews of pull requests,
              code and tickets check against published versions only. A
              published version is permanent: it cannot be unpublished or
              edited. You can keep changing the working document and publish v
              {next + 1} later.
            </AlertDialogDescription>
            {publish.isError ? (
              <Alert variant="error" className="mt-2">
                <WarningCircleIcon aria-hidden="true" />
                <AlertTitle>Could not publish</AlertTitle>
                <AlertDescription>
                  {failureText(publish.error)}
                </AlertDescription>
              </Alert>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button
              loading={publish.isPending}
              onClick={() =>
                publish.mutate(
                  { changeId: working.changeId },
                  { onSuccess: () => setConfirmOpen(false) },
                )
              }
            >
              Publish v{next}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <ChangeSourceDialog
        conversationId={conversationId}
        changeId={sourceFor}
        onClose={() => setSourceFor(null)}
      />
    </section>
  );
}

function History({
  conversationId,
  onViewSource,
}: {
  conversationId: string;
  onViewSource: (changeId: string) => void;
}) {
  const detail = useConversation(conversationId);
  const changes = useChanges(conversationId);
  const revert = useRevert(conversationId);
  const [reverting, setReverting] = useState<string | null>(null);
  const list: ChangeSummary[] = newestFirst(
    changes.data ?? detail.data?.changes ?? [],
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 px-5 py-4">
        {revert.isError ? (
          <Alert variant="error">
            <WarningCircleIcon aria-hidden="true" />
            <AlertDescription>{failureText(revert.error)}</AlertDescription>
          </Alert>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">
          Every change is saved in full. Reverting adds a new change with the
          older text, so nothing is lost.
        </p>
        <ol className="flex flex-col gap-3">
          {list.map((change, index) => {
            const isWorking = index === 0;
            return (
              <li
                key={change.id}
                className="flex flex-col gap-2 rounded-xl border bg-card p-3.5"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium tabular-nums">
                    Change {change.number}
                  </span>
                  {isWorking ? (
                    <Badge variant="secondary">Working</Badge>
                  ) : null}
                  <Badge variant="outline">
                    {change.source ? MODE_LABEL[change.source.mode] : "Manual"}
                  </Badge>
                  {change.immutable ? (
                    <Badge variant="success">
                      <LockSimpleIcon aria-hidden="true" />
                      Published
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatWhen(change.createdAt)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {change.source ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onViewSource(change.id)}
                    >
                      <ChatCircleTextIcon aria-hidden="true" />
                      View conversation
                    </Button>
                  ) : null}
                  {!isWorking ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      loading={reverting === change.id && revert.isPending}
                      disabled={revert.isPending}
                      onClick={() => {
                        setReverting(change.id);
                        revert.mutate({ toChangeId: change.id });
                      }}
                    >
                      <ArrowCounterClockwiseIcon aria-hidden="true" />
                      Revert to this
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </ScrollArea>
  );
}

function Versions({
  conversationId,
  onView,
}: {
  conversationId: string;
  onView: (number: number) => void;
}) {
  const versions = useVersions(conversationId);
  const list = [...(versions.data ?? [])].sort((a, b) => b.number - a.number);
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 px-5 py-4">
        {versions.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading versions
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Nothing is published yet. The working document is v0, and only you
            and the planning agent can see it. Publish it to create v1.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {list.map((version) => (
              <li
                key={version.number}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Badge variant="success" className="w-fit">
                    <LockSimpleIcon aria-hidden="true" />
                    {version.label}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(version.publishedAt)}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onView(version.number)}
                >
                  View
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </ScrollArea>
  );
}
