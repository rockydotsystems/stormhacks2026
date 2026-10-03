import { z } from "zod";

export const createNoteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type CreateNote = z.infer<typeof createNoteSchema>;
export type Note = {
  id: string;
  content: string;
  createdAt: string;
};
