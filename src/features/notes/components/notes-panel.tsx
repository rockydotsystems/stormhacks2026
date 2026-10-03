"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateNote, useNotes } from "@/features/notes/client/queries";

export function NotesPanel({ userId }: { userId: string }) {
  const [content, setContent] = useState("");
  const notes = useNotes(userId);
  const createNote = useCreateNote(userId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createNote.mutateAsync({ content });
      setContent("");
    } catch {
      // The mutation error is rendered below; preserve the user's input.
    }
  }

  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="notes-heading" className="text-xl font-semibold">
          Your notes
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A small example feature. Only you can see the notes you create.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col items-start gap-3">
        <Label htmlFor="note-content">New note</Label>
        <Textarea
          id="note-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
          maxLength={2000}
          rows={3}
          placeholder="Write down an idea for the hackathon…"
        />
        <Button
          type="submit"
          loading={createNote.isPending}
          disabled={createNote.isPending || !content.trim()}
        >
          <PlusIcon aria-hidden="true" />
          {createNote.isPending ? "Saving…" : "Save note"}
        </Button>
        {createNote.error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {createNote.error.message}
          </p>
        ) : null}
      </form>
      {notes.isPending ? <p role="status">Loading notes…</p> : null}
      {notes.error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {notes.error.message}
        </p>
      ) : null}
      {notes.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes yet. Add your first idea above.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Saved notes">
        {notes.data?.map((note) => (
          <li
            key={note.id}
            className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm"
          >
            {note.content}
          </li>
        ))}
      </ul>
    </section>
  );
}
