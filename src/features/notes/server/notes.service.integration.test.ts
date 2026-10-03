import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { NotesService } from "@/features/notes/server/notes.service";
import { notes } from "@/features/notes/server/schema";

// Opt in only against a disposable, migrated local/test database.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "NotesService with real Postgres",
  () => {
    const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
    const db = drizzle(sql);
    const service = new NotesService({ db });
    const ownerA = `test-${randomUUID()}`;
    const ownerB = `test-${randomUUID()}`;

    afterAll(async () => {
      try {
        await db.delete(notes).where(inArray(notes.ownerId, [ownerA, ownerB]));
      } finally {
        await sql.end();
      }
    });

    it("persists notes, isolates owners, orders newest first, and serializes dates", async () => {
      const first = await service.create(ownerA, { content: "First idea" });
      const other = await service.create(ownerB, {
        content: "Another person's private note",
      });
      const last = await service.create(ownerA, { content: "Newer idea" });
      expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(await service.list(ownerA)).toEqual([last, first]);
      expect(await service.list(ownerB)).toEqual([other]);
      expect(await service.list(`test-${randomUUID()}`)).toEqual([]);
    });
  },
);
