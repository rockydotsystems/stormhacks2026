"use client";
import { useState, type FormEvent } from "react";
import { useDocument, useDocumentAction } from "../client/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
}: {
  id: string;
  organizationId: string;
  userId: string;
}) {
  const document = useDocument(userId, organizationId, id);
  const mutation = useDocumentAction(userId, organizationId, id);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const latest = document.data?.changes.at(-1);
  const version = document.data?.versions.find((item) => item.id === versionId);
  const frozen = document.data?.changes.find(
    (item) => item.id === version?.changeId,
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setMessage(null);
    try {
      await mutation.mutateAsync({
        action: "save",
        title: String(fields.get("title")),
        content: String(fields.get("content")),
      });
      setMessage("Draft saved.");
    } catch {
      /* Mutation error is displayed alongside the form. */
    }
  }
  async function publish() {
    if (!latest) return;
    setMessage(null);
    try {
      await mutation.mutateAsync({ action: "publish", changeId: latest.id });
      setPublishOpen(false);
      setMessage("Version bound. Its history is now immutable.");
    } catch {
      /* Keep the confirmation open so the user can retry. */
    }
  }
  if (document.isPending) return <p role="status">Loading document…</p>;
  if (document.isError)
    return (
      <div role="alert">
        <p>{document.error.message}</p>
        <Button onClick={() => document.refetch()}>Try again</Button>
      </div>
    );
  return (
    <div className="detail-note space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={versionId ? "ghost" : "secondary"}
          onClick={() => setVersionId(null)}
        >
          Current draft
        </Button>
        {document.data.versions.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={versionId === item.id ? "secondary" : "ghost"}
            onClick={() => setVersionId(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {frozen ? (
        <article>
          <h2>{frozen.title}</h2>
          <p className="text-sm text-muted-foreground">
            Bound {new Date(version!.publishedAt).toLocaleDateString("en")}.
            This version is immutable.
          </p>
          <div className="whitespace-pre-wrap mt-4">{frozen.content}</div>
        </article>
      ) : (
        <form key={latest?.id || "new"} onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="draft-title">Title</Label>
            <Input
              id="draft-title"
              name="title"
              required
              defaultValue={latest?.title || "Untitled document"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="draft-content">Document</Label>
            <Textarea
              id="draft-content"
              name="content"
              defaultValue={latest?.content || ""}
              className="min-h-64"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              Save draft
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={!latest || latest.immutable || mutation.isPending}
              onClick={() => setPublishOpen(true)}
            >
              Bind saved version
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Save your changes before binding. Each save creates a full snapshot;
            binding preserves the saved history.
          </p>
        </form>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Bind this decision?</DialogTitle>
            <DialogDescription>
              Bind the saved snapshot “{latest?.title}” as v
              {(document.data.versions.at(-1)?.number || 0) + 1}. Its history
              will become immutable. Unsaved edits are not included.
            </DialogDescription>
          </DialogHeader>
          {mutation.isError && (
            <p role="alert" className="px-6 text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={publish} disabled={mutation.isPending}>
              Bind version
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
