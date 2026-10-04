"use client";

import { useState, type FormEvent } from "react";
import {
  ClipboardTextIcon,
  CopySimpleIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  TextAlignLeftIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useDocumentAction } from "../client/queries";
import type { DocumentData } from "../contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

type Dialogs = "rename" | "description" | "delete" | null;

export function documentLink(id: string) {
  return `${window.location.origin}/?document=${encodeURIComponent(id)}`;
}

function fileName(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "document"
  );
}

export function DocumentActionsMenu({
  id,
  organizationId,
  userId,
  title,
  description,
  onDeleted,
  className,
}: {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  description: string;
  onDeleted?: () => void;
  className?: string;
}) {
  const mutation = useDocumentAction(userId, organizationId, id);
  const [open, setOpen] = useState<Dialogs>(null);
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const error = mutation.error?.message;

  function show(dialog: Dialogs) {
    mutation.reset();
    setConfirmation("");
    setOpen(dialog);
  }
  async function save(
    event: FormEvent<HTMLFormElement>,
    field: "title" | "description",
  ) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get(field));
    try {
      await mutation.mutateAsync({ action: "update", [field]: value });
      setOpen(null);
    } catch {
      /* The dialog shows the error and stays open for a retry. */
    }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        action: "delete",
        confirmTitle: confirmation,
      });
      setOpen(null);
      onDeleted?.();
    } catch {
      /* The dialog shows the error and stays open for a retry. */
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(documentLink(id));
      setNotice("Link copied");
    } catch {
      setNotice("Could not copy the link");
    }
    setTimeout(() => setNotice(null), 2500);
  }
  async function markdown() {
    const data = await apiClient<DocumentData>(
      `/api/documents/${id}?organizationId=${organizationId}`,
    );
    const latest = data.changes.at(-1);
    return `# ${title}\n\n${latest?.content ?? ""}\n`;
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(await markdown());
      setNotice("Text copied");
    } catch {
      setNotice("Could not copy the text");
    }
    setTimeout(() => setNotice(null), 2500);
  }
  async function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([await markdown()], { type: "text/markdown" }),
      );
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${fileName(title)}.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("Could not download the document");
      setTimeout(() => setNotice(null), 2500);
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              className={className}
              aria-label={`Actions for ${title}`}
            />
          }
        >
          <DotsThreeIcon weight="bold" aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem className="cursor-pointer" onClick={() => show("rename")}>
            <PencilSimpleIcon aria-hidden="true" />
            Rename
          </MenuItem>
          <MenuItem
            className="cursor-pointer"
            onClick={() => show("description")}
          >
            <TextAlignLeftIcon aria-hidden="true" />
            Edit description
          </MenuItem>
          <MenuSeparator />
          <MenuItem className="cursor-pointer" onClick={download}>
            <DownloadSimpleIcon aria-hidden="true" />
            Download as Markdown
          </MenuItem>
          <MenuItem className="cursor-pointer" onClick={copyText}>
            <ClipboardTextIcon aria-hidden="true" />
            Copy as text
          </MenuItem>
          <MenuItem className="cursor-pointer" onClick={copyLink}>
            <CopySimpleIcon aria-hidden="true" />
            Copy link
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            className="cursor-pointer"
            variant="destructive"
            onClick={() => show("delete")}
          >
            <TrashIcon aria-hidden="true" />
            Delete document
          </MenuItem>
        </MenuPopup>
      </Menu>
      {notice && (
        <span className="sr-only" role="status">
          {notice}
        </span>
      )}

      <Dialog
        open={open === "rename"}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogPopup>
          <form onSubmit={(event) => save(event, "title")}>
            <DialogHeader>
              <DialogTitle>Rename document</DialogTitle>
              <DialogDescription>
                Version history keeps the titles it was published with.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 px-6 pb-4">
              <Label htmlFor={`rename-${id}`}>Name</Label>
              <Input
                id={`rename-${id}`}
                name="title"
                defaultValue={title}
                maxLength={180}
                required
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive-foreground" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save name"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={open === "description"}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogPopup>
          <form onSubmit={(event) => save(event, "description")}>
            <DialogHeader>
              <DialogTitle>Edit description</DialogTitle>
              <DialogDescription>
                Shown under the name in document lists.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 px-6 pb-4">
              <Label htmlFor={`description-${id}`}>Description</Label>
              <Textarea
                id={`description-${id}`}
                name="description"
                defaultValue={description}
                maxLength={1000}
                rows={4}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive-foreground" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save description"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={open === "delete"}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <AlertDialogPopup>
          <form onSubmit={remove}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{title}</strong> and its conversation will disappear for
                everyone in the organization. This cannot be undone from the
                app. Type the document name to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2 px-6 pb-4">
              <Label htmlFor={`delete-${id}`}>Document name</Label>
              <Input
                id={`delete-${id}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={title}
                autoComplete="off"
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive-foreground" role="alert">
                  {error}
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogClose
                render={<Button variant="outline" type="button" />}
              >
                Cancel
              </AlertDialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={confirmation.trim() !== title || mutation.isPending}
              >
                {mutation.isPending ? "Deleting…" : "Delete document"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
