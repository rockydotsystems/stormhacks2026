import { z } from "zod";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const reviewActions = new Set([
  "opened",
  "reopened",
  "synchronize",
  "ready_for_review",
  "edited",
]);
export const reviewPullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(1000),
  body: z.string().max(65000).nullable(),
  draft: z.boolean(),
  state: z.enum(["open", "closed"]),
  head: z.object({ sha }),
  base: z.object({ sha }),
});
export type ReviewPullRequest = z.infer<typeof reviewPullRequestSchema>;

export type PublishedDecision = {
  versionId: string;
  documentId: string;
  projectId: string;
  number: number;
  title: string;
  content: string;
};

export type ReviewInput = {
  organizationId: string;
  repositoryId: string;
  installationId: string;
  owner: string;
  repository: string;
  pullRequest: ReviewPullRequest;
  decisions: PublishedDecision[];
};

export const reviewResultSchema = z.object({
  summary: z.string().min(1).max(2000),
  limitations: z.array(z.string().min(1).max(600)).max(10),
  findings: z
    .array(
      z.object({
        category: z.enum([
          "direct contradiction",
          "missing planned requirement",
          "undocumented architectural decision",
          "scope expansion",
          "ambiguity",
        ]),
        versionId: z.uuid(),
        decisionQuote: z.string().min(10).max(1200),
        path: z.string().min(1).max(1000),
        line: z.number().int().positive(),
        side: z.enum(["LEFT", "RIGHT"]),
        codeQuote: z.string().min(1).max(1200),
        explanation: z.string().min(1).max(1500),
        suggestion: z.string().min(1).max(1000),
      }),
    )
    .max(10),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const reviewFileSchema = z.object({
  filename: z.string().min(1),
  status: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  patch: z.string().optional(),
});
export type ReviewFile = z.infer<typeof reviewFileSchema>;
