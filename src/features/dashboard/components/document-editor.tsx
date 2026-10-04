"use client";

import { useState } from "react";
import {
  ChatCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  GitBranchIcon,
  LockSimpleIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useDocument, useDocumentAction } from "../client/queries";
import type { DocumentData, Person } from "../contracts";
import type { Snapshot } from "@/features/docs/contracts";
import { PlanningSession } from "@/features/workspace/components/planning-session";
import { DocumentCanvas } from "@/features/workspace/components/document-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  creator: Person;
  repositories: string[];
}) {
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
      data={document.data}
      pending={mutation.isPending}
      error={mutation.error?.message}
      onSave={(snapshot) =>
        mutation.mutateAsync({ action: "save", ...snapshot })
      }
      onBind={(changeId) =>
        mutation.mutateAsync({ action: "publish", changeId })
      }
    />
  );
}

export function DocumentWorkspace({
  data,
  creator,
  repositories,
  onSave,
  onBind,
  pending,
  error,
}: {
  data: DocumentData;
  creator: Person;
  repositories: string[];
  onSave: (snapshot: Snapshot) => Promise<unknown>;
  onBind: (changeId: string) => Promise<unknown>;
  pending: boolean;
  error?: string;
}) {
  const latest = data.changes.at(-1);
  const [pane, setPane] = useState("conversation");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionId, setVersionId] = useState("draft");
  const version = data.versions.find((item) => item.id === versionId);
  const frozen = data.changes.find((item) => item.id === version?.changeId);
  const displayed = frozen || latest;
  const bound = Boolean(frozen || latest?.immutable);
  const hasDocument = Boolean(displayed?.content.trim());
  const versions = [
    { label: "Current draft", value: "draft" },
    ...data.versions
      .toReversed()
      .map((item) => ({ label: `${item.label} · Bound`, value: item.id })),
  ];

  async function publish() {
    if (!latest) return;
    try {
      await onBind(latest.id);
      setPublishOpen(false);
    } catch {
      /* Keep the confirmation open for retry. */
    }
  }
  async function accept(text: string) {
    const content = latest?.content || "";
    await onSave({
      title: latest?.title || "Untitled document",
      content: `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${text}`,
    });
  }

  return (
    <div
      className="document-workspace"
      data-pane={pane}
      data-empty={!hasDocument || undefined}
    >
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
          <ChatCircleIcon aria-hidden="true" /> Conversation
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
          onOpenDocument={() => setPane("document")}
          onAccept={accept}
          readOnly={Boolean(frozen)}
          pending={pending}
        />
        {hasDocument && (
          <section className="document-surface" aria-label="Decision document">
            <div className="document-paper-scroll">
              <article className="document-paper">
                <h1>{displayed?.title || "Untitled document"}</h1>
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
                  <Badge
                    variant={bound ? "success" : "secondary"}
                    className="decision-status"
                  >
                    {bound ? (
                      <CheckCircleIcon aria-hidden="true" />
                    ) : (
                      <span className="draft-dot" aria-hidden="true" />
                    )}
                    {bound ? "Bound" : "Draft"}
                  </Badge>
                  {pending && (
                    <span className="document-save-state" role="status">
                      {publishOpen ? "Binding…" : "Saving…"}
                    </span>
                  )}
                  {!frozen && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewOpen(true)}
                      >
                        {" "}
                        {reviewers.length
                          ? "Manage reviewers"
                          : "Request review"}
                      </Button>
                      {(reviewers.length > 0 || data.versions.length > 0) && (
                        <Button
                          size="sm"
                          onClick={() => setPublishOpen(true)}
                          disabled={!latest || latest.immutable || pending}
                        >
                          <LockSimpleIcon aria-hidden="true" /> Bind version
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {reviewers.length > 0 && (
                  <div className="document-reviewers" aria-label="Reviewers">
                    {reviewers.map((email) => (
                      <span key={email}>
                        <Avatar className="size-5">
                          <AvatarFallback>
                            {email.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {email}
                      </span>
                    ))}
                  </div>
                )}

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
                        <AvatarFallback>{creator.initials}</AvatarFallback>
                      </Avatar>
                      {creator.name}
                    </dd>
                  </div>
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
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Request review</DialogTitle>
            <DialogDescription>
              Bring teammates into the conversation to challenge the plan before
              binding it. This prototype does not send invitations or enable
              shared chat yet.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              setReviewers([
                ...new Set(
                  String(fields.get("reviewers"))
                    .split(",")
                    .map((email) => email.trim())
                    .filter(Boolean),
                ),
              ]);
              setReviewOpen(false);
            }}
          >
            <div className="px-6 pb-5 space-y-2">
              <Label htmlFor="reviewer-emails">Reviewers</Label>
              <Input
                id="reviewer-emails"
                name="reviewers"
                type="email"
                multiple
                required
                defaultValue={reviewers.join(", ")}
                placeholder="teammate@company.com"
              />
              <p className="text-xs text-muted-foreground">
                Separate email addresses with commas.
              </p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit">
                {reviewers.length ? "Update reviewers" : "Request review"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Bind this decision?</DialogTitle>
            <DialogDescription>
              Bind the saved snapshot “{latest?.title}” as v
              {(data.versions.at(-1)?.number || 0) + 1}. This agreement will be
              preserved as an immutable version.
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
              Bind version
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
