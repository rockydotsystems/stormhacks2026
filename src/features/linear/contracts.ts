import { z } from "zod";
import { organizationIdSchema } from "@/features/organizations/contracts";

export const connectLinearSchema = z.object({
  organizationId: organizationIdSchema,
});

export type LinearTeam = { id: string; name: string; key: string };

export type LinearConnectionData = {
  isAdmin: boolean;
  connection: {
    linearOrganizationName: string;
    linearUrlKey: string;
    connectedAt: string;
  } | null;
};

export type LinearSyncItem = {
  key: string;
  title: string;
  parentKey: string | null;
  state: "synced" | "missing";
  identifier: string | null;
  url: string | null;
};

export type LinearSyncSummary = {
  id: string;
  status: "running" | "failed" | "completed";
  versionLabel: string;
  error: string | null;
  completed: number;
  total: number | null;
  updatedAt: string;
  /** Every planned ticket with whether it exists in Linear. Only on document status. */
  items?: LinearSyncItem[];
};

export type DocumentLinearData = {
  connected: boolean;
  isAdmin: boolean;
  /** Latest published version, or null when nothing is published. */
  published: { versionLabel: string } | null;
  team: LinearTeam | null;
  projectUrl: string | null;
  lastSync: LinearSyncSummary | null;
};

export type LinearSyncResult = {
  sync: LinearSyncSummary;
  created: number;
  updated: number;
  skipped: number;
  projectUrl: string | null;
};
