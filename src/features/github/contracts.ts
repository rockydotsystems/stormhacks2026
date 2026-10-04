import { organizationIdSchema } from "@/features/organizations/contracts";
import { z } from "zod";

export const connectGitHubSchema = z.object({
  organizationId: organizationIdSchema,
  accountLogin: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
      "Enter a GitHub username or organization name.",
    ),
});

export type GitHubConnection = {
  configured: boolean;
  installUrl: string | null;
  installations: {
    id: string;
    accountLogin: string;
    githubUserLogin: string;
    active: boolean;
    repositories: {
      id: string;
      owner: string;
      name: string;
      available: boolean;
    }[];
  }[];
  activity: {
    id: string;
    event: string;
    action: string | null;
    receivedAt: string;
    repository: string | null;
  }[];
};
