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

// Limits for one round of staged questions. The prompt tells the model these and the server
// enforces them, because JSON-schema bounds are not reliable across providers.
export const MAX_QUESTIONS_PER_ROUND = 3;
export const MAX_SUGGESTIONS_PER_QUESTION = 4;

export const questionSchema = z.object({
  text: z.string(),
  // Answers the agent suggests, best first. The user picks one, types their own, or skips.
  suggestions: z.array(z.string()),
});
export type Question = z.infer<typeof questionSchema>;

// Trims, dedupes and caps questions. Also reads rows stored before suggestions became a list,
// which carry `suggestion: string | null`.
export function normalizeQuestions(stored: unknown): Question[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .flatMap((raw): Question[] => {
      if (raw === null || typeof raw !== "object") return [];
      const { text, suggestions, suggestion } = raw as Record<string, unknown>;
      if (typeof text !== "string" || !text.trim()) return [];
      const list = Array.isArray(suggestions)
        ? suggestions
        : typeof suggestion === "string"
          ? [suggestion]
          : [];
      const cleaned = list
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      return [
        {
          text: text.trim(),
          suggestions: [...new Set(cleaned)].slice(
            0,
            MAX_SUGGESTIONS_PER_QUESTION,
          ),
        },
      ];
    })
    .slice(0, MAX_QUESTIONS_PER_ROUND);
}

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
  // Whether an edit changes the course of the design: it reverses or replaces a decision,
  // option, technology or approach that was decided or discussed earlier. The server does not
  // apply such an edit until the people have acknowledged the earlier discussion.
  courseChange: z.object({
    detected: z.boolean(),
    // One sentence naming what would change. Null when nothing changes course.
    summary: z.string().nullable(),
  }),
  // The complete new document for an edit. Null for revert and none.
  title: z.string().nullable(),
  content: z.string().nullable(),
});
export type EditResult = z.infer<typeof editResultSchema>;

// A held proposal. Either kind stops the edit until the user acknowledges what was said before
// and gives a reason. "course" is a change of direction. "goal" is a change to the locked
// goal of the document (title, summary, or the founding problem statement).
export const gateKindSchema = z.enum(["course", "goal"]);
export type GateKind = z.infer<typeof gateKindSchema>;

export const pendingGateSchema = z.object({
  kind: gateKindSchema,
  // The user's request, as written. The edit runs from it once the gate clears.
  proposal: z.string().max(8000),
  // What would change, in one sentence.
  summary: z.string().max(1000),
});
export type PendingGate = z.infer<typeof pendingGateSchema>;

// What the history search reports back to the main agent. Quotes are checked against the
// transcript by the server, and one that cannot be found is dropped.
export const historyFindingSchema = z.object({
  kind: z.enum([
    "rationale", // why the current path was chosen
    "tradeoff", // a tradeoff that was weighed
    "objection", // an argument against the proposed change
    "rejected", // the proposed change was already discussed and turned down
    "earlier-mention", // the idea came up before, with no outcome
  ]),
  detail: z.string(),
  author: z.string().nullable(),
  quote: z.string().nullable(),
});
export type HistoryFinding = z.infer<typeof historyFindingSchema>;

export const historyFindingsSchema = z.object({
  discussedBefore: z.boolean(),
  summary: z.string(),
  findings: z.array(historyFindingSchema),
});
export type HistoryFindings = z.infer<typeof historyFindingsSchema>;

// The user's answer to a held proposal, judged by the model. Code decides what it allows.
export const gateResolutionSchema = z.object({
  outcome: z.enum([
    "proceed", // they want the change anyway
    "withdraw", // they drop the proposal
    "unclear", // they answered, but not enough
    "unrelated", // the message is about something else
  ]),
  acknowledgedPriorDiscussion: z.boolean(),
  // Why they want the change, in their words. Null when they gave none.
  reason: z.string().nullable(),
  // What the agent says back when the proposal stays held or is withdrawn.
  reply: z.string(),
});
export type GateResolution = z.infer<typeof gateResolutionSchema>;

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
  // The proposal this conversation is holding, if any.
  gate?: PendingGate | null;
  // Every message of the conversation, for the history search. Called only when a proposal
  // is held, because the input messages are capped.
  loadHistory?: () => Promise<PlanningMessage[]>;
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
  // The held proposal after this turn. Null or absent when nothing is held.
  gate?: PendingGate | null;
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
