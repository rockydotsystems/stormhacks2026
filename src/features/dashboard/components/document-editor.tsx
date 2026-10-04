"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  ClockIcon,
  FileTextIcon,
  GitBranchIcon,
  UploadSimpleIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { ChatTeardropTextIcon } from "@phosphor-icons/react/dist/csr/ChatTeardropText";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import type { TeamData } from "@/features/organizations/contracts";
import { initials } from "@/features/planning/client/live";
import { useDocument, useDocumentAction } from "../client/queries";
import type { DocumentData, Person } from "../contracts";
import { PlanningSession } from "@/features/workspace/components/planning-session";
import { DocumentHistoryDialog } from "./document-history-dialog";
import { DocumentDivider } from "./document-divider";
import { DocumentReviewersPicker } from "./document-reviewers-picker";
import { publishState } from "../lib/history";
import { DocumentCanvas } from "@/features/workspace/components/document-canvas";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export function DocumentEditor({
  id,
  organizationId,
  userId,
  ...context
}: {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  projectId: string | null;
  creator: Person;
  creatorId: string;
  repositories: string[];
  actionsTarget: HTMLElement | null;
}) {
  const queryClient = useQueryClient();
  const document = useDocument(userId, organizationId, id);
  const mutation = useDocumentAction(userId, organizationId, id);
  if (document.isPending)
    return (
      <div className="documents-empty" role="status">
        Loading document…
      </div>
    );
  if (document.isError)
    return (
      <div className="documents-empty" role="alert">
        <p>{document.error.message}</p>
        <Button onClick={() => document.refetch()}>Try again</Button>
      </div>
    );
  return (
    <DocumentWorkspace
      {...context}
      documentId={id}
      organizationId={organizationId}
      userId={userId}
      data={document.data}
      pending={mutation.isPending}
      error={mutation.error?.message}
      onDocumentChanged={() => {
        // The planning agent wrote to the document, so load it and the lists that show it.
        void queryClient.invalidateQueries({
          queryKey: ["document", userId, organizationId, id],
        });
        void queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
      }}
      onPublish={(changeId) =>
        mutation.mutateAsync({ action: "publish", changeId })
      }
    />
  );
}

export function DocumentWorkspace({
  data,
  documentId,
  organizationId,
  userId,
  creator,
  creatorId,
  repositories,
  title,
  projectId,
  onDocumentChanged,
  onPublish,
  pending,
  error,
  actionsTarget,
}: {
  data: DocumentData;
  documentId: string;
  organizationId: string;
  userId: string;
  title?: string;
  projectId: string | null;
  creator: Person;
  creatorId: string;
  repositories: string[];
  onDocumentChanged: () => void;
  onPublish: (changeId: string) => Promise<unknown>;
  pending: boolean;
  error?: string;
  actionsTarget: HTMLElement | null;
}) {
  const latest = data.changes.at(-1);
  const documentPaneId = useId();
  const searchParams = useSearchParams();
  const linkedChangeId = searchParams.get("change");
  const [pane, setPane] = useState("conversation");
  const [reviewers, setReviewers] = useState<TeamData["members"]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(Boolean(linkedChangeId));
  const [versionId, setVersionId] = useState("draft");
  const version = data.versions.find((item) => item.id === versionId);
  const frozen = data.changes.find((item) => item.id === version?.changeId);
  const displayed = frozen || latest;
  const state = publishState(data);
  const unpublished = Boolean(latest) && !latest?.immutable;
  const nextNumber = (data.versions.at(-1)?.number || 0) + 1;
  const hasDocument = Boolean(displayed?.content.trim());
  const versions = [
    {
      label: unpublished || !data.versions.length ? "Current draft" : "Latest",
      value: "draft",
    },
    ...data.versions.toReversed().map((item) => ({
      label: `${item.label} · Published`,
      value: item.id,
    })),
  ];

  async function publish() {
    if (!latest) return;
    try {
      await onPublish(latest.id);
      setPublishOpen(false);
    } catch {
      /* Keep the confirmation open for retry. */
    }
  }

  return (
    <div
      className="document-workspace"
      data-pane={pane}
      data-empty={!hasDocument || undefined}
    >
      {hasDocument &&
        actionsTarget &&
        createPortal(
          <>
            <VersionState
              state={state}
              viewing={version ? { label: version.label } : null}
            />
            {pending && (
              <span className="document-save-state" role="status">
                {publishOpen ? "Publishing…" : "Saving…"}
              </span>
            )}
            {!frozen && (
              <Button
                size="sm"
                aria-label="Publish version"
                onClick={() => setPublishOpen(true)}
                disabled={!unpublished || pending}
              >
                <UploadSimpleIcon aria-hidden="true" /> Publish
              </Button>
            )}
          </>,
          actionsTarget,
        )}
      <nav
        hidden={!hasDocument}
        className="document-pane-switch"
        aria-label="Workspace panels"
      >
        <Button
          variant={pane === "conversation" ? "secondary" : "ghost"}
          aria-pressed={pane === "conversation"}
          onClick={() => setPane("conversation")}
        >
          <ChatTeardropTextIcon aria-hidden="true" /> Conversation
        </Button>
        <Button
          variant={pane === "document" ? "secondary" : "ghost"}
          aria-pressed={pane === "document"}
          onClick={() => setPane("document")}
        >
          <FileTextIcon aria-hidden="true" /> Document
        </Button>
      </nav>
      <div className="document-workspace-body">
        <PlanningSession
          title={latest?.title || "this plan"}
          documentId={documentId}
          projectId={projectId}
          organizationId={organizationId}
          onOpenDocument={() => setPane("document")}
          onDocumentChanged={onDocumentChanged}
        />
        {hasDocument && <DocumentDivider documentId={documentPaneId} />}
        {hasDocument && (
          <section
            id={documentPaneId}
            className="document-surface"
            aria-label="Decision document"
          >
            <div className="document-paper-scroll">
              <article className="document-paper">
                <header className="document-paper-header">
                  <h1>
                    {(frozen ? frozen.title : title || latest?.title) ||
                      "Untitled document"}
                  </h1>
                </header>
                <div className="document-paper-actions">
                  <div className="document-workspace-version">
                    <Select
                      items={versions}
                      value={versionId}
                      onValueChange={(value) => {
                        if (value) {
                          setVersionId(value);
                        }
                      }}
                    >
                      <SelectTrigger size="sm" aria-label="Version history">
                        <ClockIcon aria-hidden="true" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {versions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryOpen(true)}
                  >
                    <ClockCounterClockwiseIcon aria-hidden="true" /> History
                  </Button>
                </div>

                <dl className="document-properties">
                  <div>
                    <dt>
                      <UserIcon aria-hidden="true" />
                      Created by
                    </dt>
                    <dd>
                      <Avatar className="size-5">
                        <AvatarImage
                          src={creator.picture || undefined}
                          alt=""
                        />
                        <AvatarFallback className="text-[9px]">
                          {creator.initials}
                        </AvatarFallback>
                      </Avatar>
                      {creator.name}
                    </dd>
                  </div>
                  {!frozen && (
                    <div>
                      <dt>
                        <UsersIcon aria-hidden="true" /> Reviewers
                      </dt>
                      <dd>
                        {reviewers.map((member) => (
                          <span
                            className="document-reviewer"
                            key={member.userId}
                          >
                            <Avatar className="size-5">
                              <AvatarImage
                                src={member.picture || undefined}
                                alt=""
                              />
                              <AvatarFallback className="text-[9px]">
                                {initials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            {member.name}
                          </span>
                        ))}
                        <DocumentReviewersPicker
                          userId={userId}
                          organizationId={organizationId}
                          creatorId={creatorId}
                          reviewers={reviewers}
                          onSelect={setReviewers}
                        />
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      <GitBranchIcon aria-hidden="true" /> Repositories
                    </dt>
                    <dd>
                      {repositories.length
                        ? repositories.map((repository) => (
                            <a
                              key={repository}
                              href={`https://github.com/${repository}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {repository}
                            </a>
                          ))
                        : "No repositories linked"}
                    </dd>
                  </div>
                </dl>
                {error && (
                  <p
                    className="document-feedback text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <DocumentCanvas content={displayed?.content || ""} />
              </article>
            </div>
          </section>
        )}
      </div>
      <DocumentHistoryDialog
        key={linkedChangeId || "history"}
        initialChangeId={linkedChangeId}
        open={historyOpen}
        onOpenChange={(open) => {
          // The page's copy can be older than the server's, so look again as the history opens.
          if (open) onDocumentChanged();
          setHistoryOpen(open);
        }}
        data={data}
        documentId={documentId}
        organizationId={organizationId}
        title={latest?.title || "this plan"}
      />
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Publish this document?</DialogTitle>
            <DialogDescription>
              Publish “{latest?.title}” as v{nextNumber}. A published version
              cannot be edited or deleted. Later edits become a new draft, and
              you can publish them as v{nextNumber + 1}.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="px-6 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={publish} disabled={pending}>
              Publish v{nextNumber}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

// Where the document stands: never published, current with a version, or edited since one.
function VersionState({
  state,
  viewing,
}: {
  state: ReturnType<typeof publishState>;
  // Set while an older version is on screen instead of the working copy.
  viewing: { label: string } | null;
}) {
  if (viewing)
    return (
      <Badge
        variant="success"
        className="decision-status"
        title={`${viewing.label} · Published`}
      >
        <CheckCircleIcon aria-hidden="true" />
        <span className="document-version-status">
          {viewing.label} · Published
        </span>
      </Badge>
    );
  if (state.kind === "published")
    return (
      <Badge
        variant="success"
        className="decision-status"
        title={`Published ${state.version.label}`}
      >
        <CheckCircleIcon aria-hidden="true" />
        <span className="document-version-status">
          Published {state.version.label}
        </span>
      </Badge>
    );
  if (state.kind === "edited")
    return (
      <Badge
        variant="warning"
        className="decision-status"
        title={`Edited since ${state.version.label}`}
      >
        <span className="draft-dot" aria-hidden="true" />
        <span className="document-version-status">
          Edited since {state.version.label}
        </span>
      </Badge>
    );
  return (
    <Badge variant="secondary" className="decision-status">
      <span className="draft-dot" aria-hidden="true" /> Draft
    </Badge>
  );
}
