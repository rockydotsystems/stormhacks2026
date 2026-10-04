import "server-only";
import {
  CORE_CHECKLIST_IDS,
  documentDraftSchema,
  editResultSchema,
  turnAnalysisSchema,
  type AgentTurnInput,
  type AgentTurnResult,
  type ChecklistEntry,
  type DocumentDraft,
  type Phase,
  type TurnAnalysis,
} from "@/features/planning/contracts";
import { ModelError, type ModelPort } from "@/features/planning/server/model";
import {
  buildAnalysisPrompt,
  buildEditPrompt,
  buildGenerationPrompt,
  editMessages,
} from "@/features/planning/server/prompt";
import {
  ALLOWED_IDS,
  EXTRA_IDS,
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

// A rewrite below this share of the old length needs the user to have asked for it.
const SHRINK_RATIO = 0.25;
const SHRINK_INTENT =
  /\b(delete|remove|shorten|rewrite|trim|cut|drop|condense|simplify|start over|clear|replace)\b/i;

export type TurnEvent =
  { type: "delta"; text: string } | { type: "final"; result: AgentTurnResult };

export class PlanningService {
  constructor(private readonly dependencies: { model: ModelPort }) {}

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
    for await (const partial of stream.partials) {
      const reply = (partial as { reply?: unknown } | null)?.reply;
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
      questions: analysis.questions,
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
    const edit = await this.dependencies.model.generateObject({
      system: buildEditPrompt({
        checklist: input.checklist,
        projectName: input.projectName,
        today: input.today,
        hasPrevious: previous !== null,
      }),
      messages: editMessages(input.messages, current),
      schema: editResultSchema,
      schemaName: "EditResult",
    });
    const base = {
      questions: [],
      checklist: input.checklist,
      phase: "generated" as const,
      skillVersion: SKILL_VERSION,
      mode: "edited" as const,
    };

    if (edit.action === "none") {
      return { ...base, reply: edit.reply, document: null };
    }
    if (edit.action === "revert") {
      // The server restores the stored text. The model never rewrites old content.
      if (!previous) {
        return { ...base, reply: NOTHING_TO_REVERT, document: null };
      }
      return { ...base, reply: edit.reply, document: previous };
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
      return { ...base, reply: SHRINK_BLOCKED, document: null };
    }
    if (
      next.data.title === current.title &&
      next.data.content === current.content
    ) {
      return { ...base, reply: edit.reply, document: null };
    }
    return { ...base, reply: edit.reply, document: next.data };
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

/** Every core item and every tracked extra is covered or partial. */
export function isSatisfied(checklist: ChecklistEntry[]): boolean {
  return checklist.every((entry) => entry.status !== "missing");
}
