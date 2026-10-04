import {
  CORE_CHECKLIST_IDS,
  type ChecklistEntry,
  type ChecklistStatus,
  type Phase,
  type Question,
} from "@/features/planning/contracts";
import type { ErrorKind } from "@/features/planning/client/api";
import type { MessageDto } from "@/features/planning/session-contracts";

// Pure, transient UI state for one planning conversation. Persisted facts (messages, phase,
// checklist, documents) come from the server. This module holds only what the server cannot
// know yet: the turn in flight, the reply streaming in, and the last failure.

export const CONFIRM_TEXT = "Yes, generate it.";
// Sent by the generate button and by auto-generate. The agent reads it as "enough, write it".
export const GENERATE_TEXT = "That is enough. Please write the document now.";

export type PendingTurn = {
  // Reused on retry, so the server treats a resend as the same message.
  clientMessageId: string;
  text: string;
  via: "text" | "voice";
  // Read the reply aloud when it arrives. Decided when the turn starts.
  speak: boolean;
};

export type TurnStatus = "idle" | "sending" | "error";

export type TurnUi = {
  status: TurnStatus;
  pending: PendingTurn | null;
  streamText: string;
  // What the model reasoned while it worked. Streamed, never saved. It stays after the turn
  // ends so the user can open it, and clears when the next turn starts.
  reasoningText: string;
  error: { kind: ErrorKind; message: string } | null;
};

export type TurnAction =
  | { type: "send"; turn: PendingTurn }
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "succeeded" }
  | { type: "failed"; kind: ErrorKind; message: string }
  | { type: "retry" }
  | { type: "dismiss" };

export const initialTurnUi: TurnUi = {
  status: "idle",
  pending: null,
  streamText: "",
  reasoningText: "",
  error: null,
};

export function turnReducer(state: TurnUi, action: TurnAction): TurnUi {
  switch (action.type) {
    case "send":
      if (state.status === "sending") return state;
      return {
        status: "sending",
        pending: action.turn,
        streamText: "",
        reasoningText: "",
        error: null,
      };
    case "reasoning":
      if (state.status !== "sending") return state;
      return { ...state, reasoningText: state.reasoningText + action.text };
    case "delta":
      if (state.status !== "sending") return state;
      return { ...state, streamText: state.streamText + action.text };
    case "succeeded":
      if (state.status !== "sending") return state;
      return { ...initialTurnUi, reasoningText: state.reasoningText };
    case "failed":
      if (state.status !== "sending") return state;
      // The streamed text is discarded because it was never saved.
      return {
        ...state,
        status: "error",
        streamText: "",
        error: { kind: action.kind, message: action.message },
      };
    case "retry":
      if (state.status !== "error" || !state.pending) return state;
      return {
        ...state,
        status: "sending",
        streamText: "",
        reasoningText: "",
        error: null,
      };
    case "dismiss":
      return state.status === "error" ? initialTurnUi : state;
  }
}

export function isBusy(state: TurnUi): boolean {
  return state.status === "sending";
}

// What the chat renders: saved messages, the user's pending message, and the reply streaming in.
export type ChatItem = {
  key: string;
  role: "user" | "assistant";
  // Who wrote it. Null for the agent and for a message still being sent from this tab.
  authorUserId: string | null;
  // The standby kinds are notices from the server, not speech.
  kind: MessageDto["kind"];
  content: string;
  via: "text" | "voice";
  questions: Question[];
  producedChangeId: string | null;
  streaming: boolean;
};

export function chatItems(
  messages: readonly MessageDto[],
  ui: TurnUi,
): ChatItem[] {
  const items: ChatItem[] = messages.map((message) => ({
    key: message.id,
    role: message.role,
    authorUserId: message.authorUserId,
    kind: message.kind,
    content: message.content,
    via: message.via,
    questions: message.questions ?? [],
    producedChangeId: message.producedChangeId,
    streaming: false,
  }));
  const { pending } = ui;
  if (pending) {
    // A failed turn keeps its user message on the server. Once the conversation reloads, the
    // saved copy is the last message, and showing the pending one too would repeat it.
    const last = messages.at(-1);
    const saved = last?.role === "user" && last.content === pending.text;
    if (!saved) {
      items.push({
        key: `pending-${pending.clientMessageId}`,
        role: "user",
        authorUserId: null,
        kind: "chat",
        content: pending.text,
        via: pending.via,
        questions: [],
        producedChangeId: null,
        streaming: false,
      });
    }
    if (ui.status === "sending" && ui.streamText) {
      items.push({
        key: `stream-${pending.clientMessageId}`,
        role: "assistant",
        authorUserId: null,
        kind: "chat",
        content: ui.streamText,
        via: "text",
        questions: [],
        producedChangeId: null,
        streaming: true,
      });
    }
  }
  return items;
}

// Suggested answers belong to the latest assistant message, and only while the user can answer.
export function activeQuestions(
  messages: readonly MessageDto[],
  ui: TurnUi,
): Question[] {
  if (isBusy(ui) || ui.status === "error") return [];
  const last = messages.at(-1);
  return last?.role === "assistant" ? (last.questions ?? []) : [];
}

/** Every recommended topic is covered, so the interview has nothing left to ask. */
export function allTopicsCovered(checklist: ChecklistEntry[]): boolean {
  const { covered, total } = checklistProgress(checklistRows(checklist));
  return total > 0 && covered === total;
}

export function showConfirmButton(phase: Phase, ui: TurnUi): boolean {
  return phase === "awaiting-confirmation" && ui.status === "idle";
}

// The typing indicator shows from the moment a turn starts until text begins to stream.
export function showTyping(ui: TurnUi): boolean {
  return ui.status === "sending" && ui.streamText === "";
}

// A conversation title from the first thing the user says.
export function titleFromPitch(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= 60) return flat;
  return `${flat.slice(0, 57).trimEnd()}...`;
}

const ERROR_TEXT: Record<ErrorKind, string | null> = {
  auth: "Sign in to talk to the planning agent. Your message stays here.",
  config: "The planning agent is not configured on this server yet.",
  conflict:
    "The agent is still answering an earlier message. Try again in a moment.",
  missing: "This conversation could not be found. It may have been removed.",
  other: null,
};

export function errorText(kind: ErrorKind, message: string): string {
  return ERROR_TEXT[kind] ?? message;
}

const CORE_LABELS: Record<string, string> = {
  pain: "Pain",
  users: "Users",
  goals: "Goals",
  scope: "Scope",
  requirements: "Requirements",
  constraints: "Constraints",
  stack: "Stack",
  risks: "Risks",
  openChoices: "Open choices",
};

export function checklistLabel(id: string): string {
  if (CORE_LABELS[id]) return CORE_LABELS[id];
  const spaced = id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type ChecklistRow = {
  id: string;
  label: string;
  status: ChecklistStatus;
  evidence: string | null;
};

// Core items always appear, in order, defaulting to missing. Extra items follow.
export function checklistRows(checklist: ChecklistEntry[]): ChecklistRow[] {
  const byId = new Map(checklist.map((entry) => [entry.id, entry]));
  const row = (id: string): ChecklistRow => {
    const entry = byId.get(id);
    return {
      id,
      label: checklistLabel(id),
      status: entry?.status ?? "missing",
      evidence: entry?.evidence ?? null,
    };
  };
  const core = new Set<string>(CORE_CHECKLIST_IDS);
  const extras = checklist
    .map((entry) => entry.id)
    .filter((id) => !core.has(id));
  return [...CORE_CHECKLIST_IDS, ...extras].map(row);
}

export function checklistProgress(rows: ChecklistRow[]): {
  covered: number;
  total: number;
} {
  return {
    covered: rows.filter((r) => r.status === "covered").length,
    total: rows.length,
  };
}

// Document history helpers. Change ids are decimal strings of a bigint, so compare as bigint.
export function newestFirst<T extends { id: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const left = BigInt(a.id);
    const right = BigInt(b.id);
    return left === right ? 0 : left < right ? 1 : -1;
  });
}

// The next version number a publish would create.
export function nextVersionNumber(publishedNumber: number | null): number {
  return (publishedNumber ?? 0) + 1;
}

// True when the working document is exactly the published one, so there is nothing to publish.
export function isPublished(label: string): boolean {
  return /^v[1-9]\d*$/.test(label);
}

// A short, readable time for history rows.
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
