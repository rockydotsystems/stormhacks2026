"use client";

import { useState, type FormEvent } from "react";
import {
  DotsThreeIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useProjectAction } from "../client/queries";
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

type Dialogs = "edit" | "delete" | null;

export function ProjectActionsMenu({
  id,
  organizationId,
  userId,
  name,
  description,
  documentCount,
  onDeleted,
  className,
}: {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  description: string;
  documentCount: number;
  onDeleted?: () => void;
  className?: string;
}) {
  const mutation = useProjectAction(userId, organizationId, id);
  const [open, setOpen] = useState<Dialogs>(null);
  const [confirmation, setConfirmation] = useState("");
  const error = mutation.error?.message;

  function show(dialog: Dialogs) {
    mutation.reset();
    setConfirmation("");
    setOpen(dialog);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await mutation.mutateAsync({
        action: "update",
        name: String(form.get("name")),
        description: String(form.get("description")),
      });
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
        confirmName: confirmation,
      });
      setOpen(null);
      onDeleted?.();
    } catch {
      /* The dialog shows the error and stays open for a retry. */
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
              aria-label={`Actions for ${name}`}
            />
          }
        >
          <DotsThreeIcon weight="bold" aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem className="cursor-pointer" onClick={() => show("edit")}>
            <PencilSimpleIcon aria-hidden="true" />
            Edit project
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            className="cursor-pointer"
            variant="destructive"
            onClick={() => show("delete")}
          >
            <TrashIcon aria-hidden="true" />
            Delete project
          </MenuItem>
        </MenuPopup>
      </Menu>

      <Dialog
        open={open === "edit"}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogPopup>
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>Edit project</DialogTitle>
              <DialogDescription>
                The name and description show on the project card.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 px-6 pb-4">
              <Label htmlFor={`project-name-${id}`}>Name</Label>
              <Input
                id={`project-name-${id}`}
                name="name"
                defaultValue={name}
                maxLength={80}
                required
                autoFocus
              />
              <Label htmlFor={`project-description-${id}`}>Description</Label>
              <Textarea
                id={`project-description-${id}`}
                name="description"
                defaultValue={description}
                maxLength={1000}
                rows={4}
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
                {mutation.isPending ? "Saving…" : "Save project"}
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
              <AlertDialogTitle>Delete this project?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{name}</strong>
                {documentCount > 0
                  ? ` and its ${documentCount} ${documentCount === 1 ? "document" : "documents"}`
                  : ""}{" "}
                will disappear for everyone in the organization. This cannot be
                undone from the app. Type the project name to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2 px-6 pb-4">
              <Label htmlFor={`project-delete-${id}`}>Project name</Label>
              <Input
                id={`project-delete-${id}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={name}
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
                disabled={confirmation.trim() !== name || mutation.isPending}
              >
                {mutation.isPending ? "Deleting…" : "Delete project"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
