import "server-only";
import { desc, eq } from "drizzle-orm";
import type { CreateNote, Note } from "@/features/notes/contracts";
import { notes } from "@/features/notes/server/schema";
import type { Database } from "@/server/db";

const noteColumns = {
  id: notes.id,
  content: notes.content,
  createdAt: notes.createdAt,
};

export class NotesService {
  constructor(private readonly dependencies: { db: Database }) {}

  async list(ownerId: string): Promise<Note[]> {
    const rows = await this.dependencies.db
      .select(noteColumns)
      .from(notes)
      .where(eq(notes.ownerId, ownerId))
      .orderBy(desc(notes.createdAt), desc(notes.id));
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async create(ownerId: string, input: CreateNote): Promise<Note> {
    const [row] = await this.dependencies.db
      .insert(notes)
      .values({ ownerId, content: input.content })
      .returning(noteColumns);
    return { ...row, createdAt: row.createdAt.toISOString() };
  }
}
