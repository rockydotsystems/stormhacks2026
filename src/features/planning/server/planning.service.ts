import "server-only";
import {
  CORE_CHECKLIST_IDS,
  documentDraftSchema,
  editResultSchema,
  gateResolutionSchema,
  historyFindingsSchema,
  normalizeQuestions,
  turnAnalysisSchema,
  type AgentTurnInput,
  type AgentTurnResult,
  type ChecklistEntry,
  type DocumentDraft,
  type GateKind,
  type HistoryFindings,
  type PendingGate,
  type Phase,
  type TurnAnalysis,
} from "@/features/planning/contracts";
import { ModelError, type ModelPort } from "@/features/planning/server/model";
import {
  buildAnalysisPrompt,
  buildEditPrompt,
  buildGenerationPrompt,
  editMessages,
  gateRaisePrompt,
  gateResolutionPrompt,
  historySearchMessages,
  historySearchPrompt,
  transcriptOf,
} from "@/features/planning/server/prompt";
import { changedGoalParts } from "@/features/planning/server/goal-lock";
import {
  ALLOWED_IDS,
  EXTRA_IDS,
  MUST_COVER_IDS,
  SKILL_VERSION,
} from "@/features/planning/skill/planning-skill";
import { ApiError } from "@/server/errors";

const CONFIRMATION_PROMPT =
  "I have enough to write the first draft. Anything you did not decide will be listed as an open decision. Ready for me to generate it?";
const GENERATED_REPLY =
  "Here is the first draft. Tell me what to change and I will update it.";
const NOTHING_TO_REVERT = "There is no earlier version to go back to.";
const SHRINK_BLOCKED =
  "I did not change the document. That edit would have removed most of it. If you meant to shorten or remove that much, say so and I will do it.";

// Items the interview cannot end without, covered in full. See the planning skill.
const MUST_BE_COVERED = MUST_COVER_IDS;

// How hard the model thinks while interviewing. Generation and edits stay on the default.
const ANALYSIS_REASONING = "medium" as const;

// Words the agent uses when the model cannot supply the text for a held proposal.
const HELD_REPLY =
  "I have not changed the document. This change goes against something already settled, so before I make it, please confirm you have seen the earlier discussion and tell me why we should move this way now.";
const NEEDS_ACKNOWLEDGEMENT =
  "I am still holding the change. Please confirm you have seen the earlier discussion about this, then I will make it.";
const NEEDS_REASON =
  "I am still holding the change. Please tell me why we should move this way now, then I will make it.";
const WITHDRAWN_REPLY = "Understood. I left the document as it is.";
const MIN_REASON_LENGTH = 8;

// The history search reads at most this much of the conversation, keeping the newest part.
const SEARCH_CHARS = 200_000;
const MAX_FINDINGS = 8;

// A rewrite below this share of the old length needs the user to have asked for it.
const SHRINK_RATIO = 0.25;
const SHRINK_INTENT =
  /\b(delete|remove|shorten|rewrite|trim|cut|drop|condense|simplify|start over|clear|replace)\b/i;

// The part of a stored message the summary reads.
export type SummaryMessage = {
  role: "user" | "assistant";
  content: string;
  questions: { text: string }[] | null;
};

const SUMMARY_PROMPT = [
  "You summarize the conversation between a team and a planning agent that led the agent to change a document.",
  "Write exactly three lines, in this order, each starting with the label shown:",
  "Discussed: one or two sentences on what the team talked about.",
  "Decided: one or two sentences on what the team decided and why.",
  "Changed: one sentence on what the agent then changed in the document.",
  "Answers to numbered questions are written as [number: answer]. Match each to the question with that number. Use only what the conversation says. Do not invent reasons or decisions. Use no other headings, bullets, or quotes.",
].join("\n");

export type TurnEvent =
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "final"; result: AgentTurnResult };

export class PlanningService {
  constructor(private readonly dependencies: { model: ModelPort }) {}

  // A short account of what the team discussed that led to a change. Plain text, never stored here.
  async summarize(messages: SummaryMessage[]): Promise<string> {
    const transcript = messages
      .map((message) => {
        if (message.role === "user") return `Team: ${message.content}`;
        const questions = (message.questions ?? [])
          .map((question, index) => `  ${index + 1}. ${question.text}`)
          .join("\n");
        return `Agent: ${message.content}${questions ? `\nQuestions asked:\n${questions}` : ""}`;
      })
      .join("\n\n")
      .slice(-SEARCH_CHARS);
    const text = await this.dependencies.model.generateText({
      system: SUMMARY_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });
    return text.trim();
  }

  async runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    assertTurn(input);
    if (input.phase === "generated") return this.editTurn(input);
    const analysis = await this.dependencies.model.generateObject(
      this.analysisRequest(input),
    );
    return this.finishAnalysis(input, analysis);
  }

  /**
   * The same turn as runTurn, with the reply streamed while the analysis is written.
   * Deltas are provisional. The final event carries the authoritative reply, which differs
   * when the server appends the confirmation question or generates the document. If the
   * analysis turns out invalid, this throws a ModelError after some deltas, so the UI must
   * discard the streamed text on error. Edit turns are not streamed.
   */
  async *streamTurn(input: AgentTurnInput): AsyncIterable<TurnEvent> {
    assertTurn(input);
    if (input.phase === "generated") {
      yield { type: "final", result: await this.editTurn(input) };
      return;
    }
    const stream = this.dependencies.model.streamObject(
      this.analysisRequest(input),
    );
    let sent = "";
    for await (const event of stream.events) {
      if (event.type === "reasoning") {
        yield { type: "reasoning", text: event.text };
        continue;
      }
      const reply = (event.value as { reply?: unknown } | null)?.reply;
      if (
        typeof reply === "string" &&
        reply.length > sent.length &&
        reply.startsWith(sent)
      ) {
        yield { type: "delta", text: reply.slice(sent.length) };
        sent = reply;
      }
    }
    const analysis = await stream.result;
    yield { type: "final", result: await this.finishAnalysis(input, analysis) };
  }

  private analysisRequest(input: AgentTurnInput) {
    return {
      system: buildAnalysisPrompt({
        phase: input.phase,
        checklist: input.checklist,
        projectName: input.projectName,
        today: input.today,
      }),
      messages: input.messages,
      schema: turnAnalysisSchema,
      schemaName: "TurnAnalysis",
      reasoning: ANALYSIS_REASONING,
    };
  }

  private async finishAnalysis(
    input: AgentTurnInput,
    analysis: TurnAnalysis,
  ): Promise<AgentTurnResult> {
    const checklist = normalizeChecklist(analysis.checklist, input.checklist);

    const generateNow =
      analysis.userSignal === "enough" ||
      (input.phase === "awaiting-confirmation" &&
        analysis.userSignal === "confirm");
    if (generateNow) {
      const document = await this.dependencies.model.generateObject({
        system: buildGenerationPrompt({
          checklist,
          projectName: input.projectName,
          today: input.today,
        }),
        messages: input.messages,
        schema: documentDraftSchema,
        schemaName: "DocumentDraft",
      });
      return {
        reply: GENERATED_REPLY,
        questions: [],
        checklist,
        phase: "generated",
        document,
        skillVersion: SKILL_VERSION,
        mode: "generated",
      };
    }

    // Declining or adding more detail while a confirmation is pending returns to grilling.
    const nextPhase: Phase =
      input.phase === "grilling" && isSatisfied(checklist)
        ? "awaiting-confirmation"
        : "grilling";
    if (nextPhase === "awaiting-confirmation") {
      return {
        reply: `${analysis.reply.trim()}\n\n${CONFIRMATION_PROMPT}`.trim(),
        questions: [],
        checklist,
        phase: nextPhase,
        document: null,
        skillVersion: SKILL_VERSION,
        mode: "confirming",
      };
    }
    return {
      reply: analysis.reply,
      questions: normalizeQuestions(analysis.questions),
      checklist,
      phase: nextPhase,
      document: null,
      skillVersion: SKILL_VERSION,
      mode: "grilling",
    };
  }

  /** A turn after generation: change the working document, or answer a question about it. */
  private async editTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    const current = input.document;
    if (!current) {
      throw new ApiError(
        400,
        "A generated session needs its working document.",
      );
    }
    const previous = input.previousDocument ?? null;
    const instruction = input.messages[input.messages.length - 1].content;
    const held = input.gate ?? null;
    const base = {
      questions: [],
      checklist: input.checklist,
      phase: "generated" as const,
      skillVersion: SKILL_VERSION,
      mode: "edited" as const,
    };

    // A held proposal comes first. Only the code below can release it.
    let cleared: { gate: PendingGate; reason: string } | null = null;
    if (held) {
      const verdict = await this.resolveGate(input, held);
      if (verdict.kind === "held") {
        return { ...base, reply: verdict.reply, document: null, gate: held };
      }
      if (verdict.kind === "withdrawn") {
        return { ...base, reply: verdict.reply, document: null, gate: null };
      }
      if (verdict.kind === "proceed") {
        cleared = { gate: held, reason: verdict.reason };
      }
    }
    // The gate that stays after this turn. An unrelated message leaves it where it was.
    const carried = held && !cleared ? held : null;

    const edit = await this.dependencies.model.generateObject({
      system: buildEditPrompt({
        checklist: input.checklist,
        projectName: input.projectName,
        today: input.today,
        hasPrevious: previous !== null,
        cleared,
      }),
      messages: editMessages(input.messages, current),
      schema: editResultSchema,
      schemaName: "EditResult",
    });
    // What the user is asking for. After a cleared hold, that is the held proposal.
    const proposal = cleared ? cleared.gate.proposal : instruction;
    const hold = (kind: GateKind, summary: string) =>
      this.raiseGate(input, current, { kind, proposal, summary });

    if (edit.action === "none") {
      return { ...base, reply: edit.reply, document: null, gate: carried };
    }
    if (edit.action === "revert") {
      // The server restores the stored text. The model never rewrites old content.
      if (!previous) {
        return {
          ...base,
          reply: NOTHING_TO_REVERT,
          document: null,
          gate: carried,
        };
      }
      const moved = changedGoalParts(current, previous);
      if (moved.length > 0 && cleared?.gate.kind !== "goal") {
        return {
          ...base,
          ...(await hold(
            "goal",
            `Reverting would change ${moved.join(", ")}.`,
          )),
        };
      }
      return { ...base, reply: edit.reply, document: previous, gate: null };
    }

    const next = documentDraftSchema.safeParse({
      title: edit.title,
      content: edit.content,
    });
    if (!next.success) {
      throw new ModelError(
        "invalid-output",
        "The edit did not return a complete document.",
      );
    }
    if (isDrasticShrink(current, next.data, instruction)) {
      return { ...base, reply: SHRINK_BLOCKED, document: null, gate: carried };
    }
    if (
      next.data.title === current.title &&
      next.data.content === current.content
    ) {
      return { ...base, reply: edit.reply, document: null, gate: carried };
    }
    if (edit.courseChange.detected && !cleared) {
      return {
        ...base,
        ...(await hold(
          "course",
          edit.courseChange.summary?.trim() ||
            "This changes the course of a decision.",
        )),
      };
    }
    const moved = changedGoalParts(current, next.data);
    if (moved.length > 0 && cleared?.gate.kind !== "goal") {
      return {
        ...base,
        ...(await hold("goal", `This would change ${moved.join(", ")}.`)),
      };
    }
    return { ...base, reply: edit.reply, document: next.data, gate: null };
  }

  /**
   * Holds a proposal. A search agent reads the whole conversation for earlier discussion of
   * it, then the main agent reports what it found and asks the team to acknowledge it and give
   * a reason. A failed search never lets the change through. It only means the report says so.
   */
  private async raiseGate(
    input: AgentTurnInput,
    current: DocumentDraft,
    gate: PendingGate,
  ): Promise<{ reply: string; document: null; gate: PendingGate }> {
    const findings = await this.searchHistory(input, current, gate.proposal);
    let reply = HELD_REPLY;
    try {
      const text = await this.dependencies.model.generateText({
        system: gateRaisePrompt({
          kind: gate.kind,
          summary: gate.summary,
          findings,
          projectName: input.projectName,
        }),
        messages: [{ role: "user", content: gate.proposal }],
      });
      if (text.trim()) reply = text.trim();
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
    }
    return { reply, document: null, gate };
  }

  /** The search agent. Null when it fails, so the caller can say it could not look. */
  private async searchHistory(
    input: AgentTurnInput,
    current: DocumentDraft,
    proposal: string,
  ): Promise<HistoryFindings | null> {
    try {
      const history = input.loadHistory
        ? await input.loadHistory()
        : input.messages;
      const transcript = transcriptOf(history).slice(-SEARCH_CHARS);
      const found = await this.dependencies.model.generateObject({
        system: historySearchPrompt(),
        messages: historySearchMessages(transcript, proposal, current),
        schema: historyFindingsSchema,
        schemaName: "HistoryFindings",
      });
      const squash = (text: string) => text.replace(/\s+/g, " ").trim();
      const haystack = squash(transcript + " " + current.content);
      const findings = found.findings.slice(0, MAX_FINDINGS).map((finding) => ({
        ...finding,
        // A quote the model could not copy from the conversation is dropped.
        quote:
          finding.quote && haystack.includes(squash(finding.quote))
            ? finding.quote
            : null,
      }));
      return {
        discussedBefore: found.discussedBefore && findings.length > 0,
        summary: found.summary,
        findings,
      };
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      console.error("History search failed", error);
      return null;
    }
  }

  /**
   * Reads the newest messages against a held proposal. The model describes them and this code
   * decides. A change goes ahead only when the model saw both an acknowledgement of the earlier
   * discussion and a reason.
   */
  private async resolveGate(
    input: AgentTurnInput,
    gate: PendingGate,
  ): Promise<
    | { kind: "held"; reply: string }
    | { kind: "withdrawn"; reply: string }
    | { kind: "proceed"; reason: string }
    | { kind: "unrelated" }
  > {
    const recent = input.messages.slice(-10);
    const start = recent.findIndex((message) => message.role === "user");
    const resolution = await this.dependencies.model.generateObject({
      system: gateResolutionPrompt(gate),
      messages: start === -1 ? input.messages.slice(-1) : recent.slice(start),
      schema: gateResolutionSchema,
      schemaName: "GateResolution",
    });
    const reply = resolution.reply.trim();
    if (resolution.outcome === "unrelated") return { kind: "unrelated" };
    if (resolution.outcome === "withdraw") {
      return { kind: "withdrawn", reply: reply || WITHDRAWN_REPLY };
    }
    const reason = resolution.reason?.trim() ?? "";
    const reasoned = reason.length >= MIN_REASON_LENGTH;
    if (
      resolution.outcome === "proceed" &&
      resolution.acknowledgedPriorDiscussion &&
      reasoned
    ) {
      return { kind: "proceed", reason };
    }
    if (reply && resolution.outcome === "unclear") {
      return { kind: "held", reply };
    }
    return {
      kind: "held",
      reply: resolution.acknowledgedPriorDiscussion
        ? NEEDS_REASON
        : NEEDS_ACKNOWLEDGEMENT,
    };
  }
}

function assertTurn(input: AgentTurnInput): void {
  if (input.messages[input.messages.length - 1]?.role !== "user") {
    throw new ApiError(400, "The last message must come from the user.");
  }
}

function isDrasticShrink(
  before: DocumentDraft,
  after: DocumentDraft,
  instruction: string,
): boolean {
  return (
    after.content.length < before.content.length * SHRINK_RATIO &&
    !SHRINK_INTENT.test(instruction)
  );
}

/**
 * Validates model checklist output. Unknown ids are dropped, duplicates keep the first entry,
 * and every core id is always present. A core id the model omitted keeps its previous entry,
 * or is missing. A partial entry with no recorded open decision counts as missing.
 */
export function normalizeChecklist(
  fromModel: ChecklistEntry[],
  previous: ChecklistEntry[],
): ChecklistEntry[] {
  const byId = new Map<string, ChecklistEntry>();
  for (const entry of fromModel) {
    if (ALLOWED_IDS.has(entry.id) && !byId.has(entry.id)) {
      byId.set(entry.id, sanitize(entry));
    }
  }
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const core = CORE_CHECKLIST_IDS.map(
    (id): ChecklistEntry =>
      byId.get(id) ??
      previousById.get(id) ?? { id, status: "missing", evidence: null },
  );
  const extras = EXTRA_IDS.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
  return [...core, ...extras];
}

function sanitize(entry: ChecklistEntry): ChecklistEntry {
  const evidence = entry.evidence?.trim() || null;
  if (entry.status === "partial" && !evidence) {
    return { id: entry.id, status: "missing", evidence: null };
  }
  if (entry.status === "missing") {
    return { id: entry.id, status: "missing", evidence: null };
  }
  return { id: entry.id, status: entry.status, evidence };
}

/**
 * The interview may end when the items the document cannot be written without are fully
 * covered and nothing else is missing. Every other core item and tracked extra may stay
 * partial, because a partial entry names its open decision and the document records it.
 */
export function isSatisfied(checklist: ChecklistEntry[]): boolean {
  const byId = new Map(checklist.map((entry) => [entry.id, entry]));
  const required = MUST_BE_COVERED.every(
    (id) => byId.get(id)?.status === "covered",
  );
  return required && checklist.every((entry) => entry.status !== "missing");
}
