"use client";

import { useState, type FormEvent } from "react";
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
    <section aria-labelledby="notes-heading" className="space-y-6">
      <div>
        <h2 id="notes-heading" className="text-xl font-semibold">
          Your notes
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          A small example feature. Only you can see the notes you create.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="note-content" className="block text-sm font-medium">
          New note
        </label>
        <textarea
          id="note-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
          maxLength={2000}
          rows={3}
          className="w-full rounded-lg border border-zinc-300 p-3"
          placeholder="Write down an idea for the hackathon…"
        />
        <button
          disabled={createNote.isPending || !content.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {createNote.isPending ? "Saving…" : "Save note"}
        </button>
        {createNote.error ? (
          <p role="alert" className="text-sm text-red-700">
            {createNote.error.message}
          </p>
        ) : null}
      </form>
      {notes.isPending ? <p role="status">Loading notes…</p> : null}
      {notes.error ? (
        <p role="alert" className="text-sm text-red-700">
          {notes.error.message}
        </p>
      ) : null}
      {notes.data?.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No notes yet. Add your first idea above.
        </p>
      ) : null}
      <ul className="space-y-3" aria-label="Saved notes">
        {notes.data?.map((note) => (
          <li
            key={note.id}
            className="whitespace-pre-wrap break-words rounded-lg border border-zinc-200 p-4 text-sm"
          >
            {note.content}
          </li>
        ))}
      </ul>
    </section>
  );
}
