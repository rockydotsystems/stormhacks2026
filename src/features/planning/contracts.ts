import { z } from "zod";

// Client-safe contracts for the planning session. Shared by server, routes and UI.
// DTOs are JSON-friendly. This file is the interface between the parallel workstreams.

export const CORE_CHECKLIST_IDS = [
  "pain",
  "users",
  "goals",
  "scope",
  "requirements",
  "constraints",
  "stack",
  "risks",
  "openChoices",
] as const;

export const checklistStatusSchema = z.enum(["covered", "partial", "missing"]);
export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;

export const checklistEntrySchema = z.object({
  id: z.string(),
  status: checklistStatusSchema,
  // Short quote from the conversation that supports the status. Null when missing.
  evidence: z.string().nullable(),
});
export type ChecklistEntry = z.infer<typeof checklistEntrySchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});
export type PlanningMessage = z.infer<typeof chatMessageSchema>;

// Phase of the session. The client holds it and sends it back with each turn.
export const phaseSchema = z.enum([
  "grilling",
  "awaiting-confirmation",
  "generated",
]);
export type Phase = z.infer<typeof phaseSchema>;

// What the user meant with their latest message, judged by the model.
export const userSignalSchema = z.enum([
  "continue", // normal answer or pitch
  "enough", // "that's enough", "just draft it"
  "confirm", // yes, generate
  "decline", // not yet, keep asking
]);
export type UserSignal = z.infer<typeof userSignalSchema>;

export const questionSchema = z.object({
  text: z.string(),
  // The agent may suggest an answer. The user accepts it or answers differently.
  suggestion: z.string().nullable(),
});
export type Question = z.infer<typeof questionSchema>;

// Model output for one grilling turn.
export const turnAnalysisSchema = z.object({
  reply: z.string(),
  questions: z.array(questionSchema),
  checklist: z.array(checklistEntrySchema),
  userSignal: userSignalSchema,
});
export type TurnAnalysis = z.infer<typeof turnAnalysisSchema>;

// The document is one Markdown string plus a title. The latest change is the working document.
export const documentDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1),
});
export type DocumentDraft = z.infer<typeof documentDraftSchema>;

// Model output for one edit turn after the document exists. A revert is carried out by the
// server from the previous document, so the model never rewrites old text from memory.
export const editResultSchema = z.object({
  reply: z.string(),
  action: z.enum(["edit", "revert", "none"]),
  // The complete new document for an edit. Null for revert and none.
  title: z.string().nullable(),
  content: z.string().nullable(),
});
export type EditResult = z.infer<typeof editResultSchema>;

// Server-internal agent contract. Persistence and HTTP layers code against these two types.
export type AgentTurnInput = {
  messages: PlanningMessage[];
  phase: Phase;
  checklist: ChecklistEntry[];
  projectName?: string;
  // The working document (the latest change). Null before the first generation.
  document: DocumentDraft | null;
  // The change before the working one. Lets the agent revert without reading history.
  previousDocument?: DocumentDraft | null;
  // Server-supplied ISO date for the MADR Date line. The agent never invents dates.
  today?: string;
};

export type AgentTurnResult = {
  reply: string;
  questions: Question[];
  checklist: ChecklistEntry[];
  phase: Phase;
  // The NEW full working document when this turn produced or changed one, otherwise null.
  // The caller stores it as a new change.
  document: DocumentDraft | null;
  skillVersion: string;
  // grilling: still interviewing. confirming: waiting for the user to confirm generation.
  // generated: the first draft was written this turn. edited: a turn after generation
  // (document is null when nothing changed).
  mode: "grilling" | "confirming" | "generated" | "edited";
};

// HTTP request for a turn. The client holds the session state until persistence lands.
export const turnRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(100),
  phase: phaseSchema,
  checklist: z.array(checklistEntrySchema).default([]),
  // Name of the project, used for context only.
  projectName: z.string().max(200).optional(),
  document: documentDraftSchema.nullable().default(null),
  previousDocument: documentDraftSchema.nullable().default(null),
});
export type TurnRequest = z.infer<typeof turnRequestSchema>;

export type TurnResponse = AgentTurnResult;
