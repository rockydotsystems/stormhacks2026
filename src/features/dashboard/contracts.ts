import { organizationIdSchema } from "@/features/organizations/contracts";
import { z } from "zod";
import {
  projectSchema,
  githubRepositorySchema,
} from "@/features/projects/contracts";
import { snapshotSchema, changeIdSchema } from "@/features/docs/contracts";
import type { DocChange, DocVersion } from "@/features/docs/contracts";
import type { Decision, Project } from "./data";

export type Person = { name: string; initials: string; picture: string | null };
export type DashboardData = {
  organizations: { id: string; name: string }[];
  organizationId: string | null;
  projects: (Project & { id: string })[];
  documents: Decision[];
  repositories: { id: string; owner: string; name: string }[];
  people: Record<string, Person>;
};
export type DocumentData = { changes: DocChange[]; versions: DocVersion[] };
const organizationId = organizationIdSchema;
export const dashboardActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createOrganization"),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("createProject"),
    organizationId,
    ...projectSchema.shape,
    repositoryIds: z.array(z.uuid()).max(100),
  }),
  z.object({
    action: z.literal("connectRepository"),
    organizationId,
    ...githubRepositorySchema.shape,
  }),
  z.object({
    action: z.literal("createDocument"),
    organizationId,
    projectId: z.uuid(),
    title: z.string().trim().min(1).max(180),
    content: z.string().max(1000),
  }),
]);
export type DashboardAction = z.input<typeof dashboardActionSchema>;
export const documentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    organizationId,
    ...snapshotSchema.shape,
    content: z.string().max(1000000),
  }),
  z.object({
    action: z.literal("publish"),
    organizationId,
    changeId: changeIdSchema,
  }),
]);
