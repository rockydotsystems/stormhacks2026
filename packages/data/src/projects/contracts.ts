import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
});

// Written out because a partial of projectSchema would still fill in the empty description.
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
    "Change the name or description.",
  );

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

export type CreateProject = z.input<typeof projectSchema>;
export type UpdateProject = z.input<typeof updateProjectSchema>;
export type GithubRepositoryInput = z.input<typeof githubRepositorySchema>;
export type Project = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  createdAt: string;
};
