import { z } from "zod";

export const snapshotSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string(),
});

export const changeIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .max(19)
  .pipe(
    z
      .string()
      .refine(
        (value) => BigInt(value) <= BigInt("9223372036854775807"),
        "Change ID is out of range.",
      ),
  );

export type Snapshot = z.infer<typeof snapshotSchema>;
export type Doc = {
  id: string;
  organizationId: string;
  projectId: string;
  createdAt: string;
};
export type DocChange = Snapshot & {
  id: string;
  docId: string;
  number: number;
  immutable: boolean;
  proposed: boolean;
  createdBy: string;
  createdAt: string;
};
export type DocVersion = {
  id: string;
  docId: string;
  changeId: string;
  number: number;
  label: string;
  publishedBy: string;
  publishedAt: string;
};
