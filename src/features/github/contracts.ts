import { organizationIdSchema } from "@/features/organizations/contracts";
import { z } from "zod";

export const connectGitHubSchema = z.object({
  organizationId: organizationIdSchema,
});

export type GitHubChoices = {
  authorized: boolean;
  installations: {
    id: string;
    accountLogin: string;
    accountType: "User" | "Organization";
    disabledReason: string | null;
  }[];
};

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
