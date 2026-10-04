import { z } from "zod";

export const snapshotSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string(),
});

export const githubRepositorySchema = z.object({
  owner: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
    .transform((value) => value.toLowerCase()),
  name: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .refine(
      (value) => value !== "." && value !== "..",
      "Use a repository name.",
    )
    .transform((value) => value.toLowerCase()),
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
export type GithubRepositoryInput = z.input<typeof githubRepositorySchema>;
export type OrganizationActor = { organizationId: string; userId: string };

export type Doc = { id: string; organizationId: string; createdAt: string };
export type DocChange = Snapshot & {
  id: string;
  docId: string;
  number: number;
  immutable: boolean;
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
