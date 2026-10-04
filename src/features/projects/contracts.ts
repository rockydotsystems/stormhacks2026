import { z } from "zod";

export const projectSchema = z.object({ name: z.string().trim().min(1) });

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

export type CreateProject = z.infer<typeof projectSchema>;
export type GithubRepositoryInput = z.input<typeof githubRepositorySchema>;
export type Project = {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
};
