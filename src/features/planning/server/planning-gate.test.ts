import { describe, expect, it } from "vitest";
import type {
  AgentTurnInput,
  DocumentDraft,
  EditResult,
  GateResolution,
  HistoryFindings,
  PendingGate,
} from "@/features/planning/contracts";
import { FakeModel } from "@/features/planning/server/fake.model";
import {
  changedGoalParts,
  lockedGoal,
} from "@/features/planning/server/goal-lock";
import type {
  ModelRequest,
  ObjectRequest,
} from "@/features/planning/server/model";
import { PlanningService } from "@/features/planning/server/planning.service";

const draft: DocumentDraft = {
  title: "Log search",
  content: [
    "# Log search",
    "",
    "Search incident logs quickly.",
    "",
    "## Summary",
    "",
    "- Problem: on-call engineers grep logs by hand.",
    "",
    "## Decision: Implementation language",
    "",
    "- Status: proposed",
    "",
    "### Context and Problem Statement",
    "",
    "Which language do we write the indexer in?",
    "",
    "### Considered Options",
    "",
    "- Python",
    "- Rust",
    "",
    "### Decision Outcome",
    "",
    'Chosen option: "Python", because the team knows it.',
    "",
  ].join("\n"),
};

const noChange = { detected: false, summary: null };

function edit(overrides: Partial<EditResult> = {}): EditResult {
  return {
    reply: "Done.",
    action: "edit",
    courseChange: noChange,
    title: draft.title,
    content: `${draft.content}\n## Risk\n\nStale results.\n`,
    ...overrides,
  };
}

const findings: HistoryFindings = {
  discussedBefore: true,
  summary: "Rust came up on Monday and was set aside.",
  findings: [
    {
      kind: "rejected",
      detail: "Rust was rejected for hiring reasons.",
      author: "Ana",
      quote: "we cannot hire Rust people here",
    },
    {
      kind: "rationale",
      detail: "Invented quote that was never said.",
      author: null,
      quote: "this sentence is not in the chat",
    },
  ],
};

function setup(script: {
  edit?: EditResult;
  findings?: HistoryFindings | "fail";
  resolution?: GateResolution;
  raise?: string;
}) {
  const model = new FakeModel({
    text: () =>
      script.raise ?? "Held. Anything before? Please confirm and say why.",
    object: (request: ModelRequest) => {
      switch ((request as ObjectRequest<unknown>).schemaName) {
        case "EditResult":
          return script.edit ?? edit();
        case "HistoryFindings":
          if (script.findings === "fail") return { nope: true };
          return script.findings ?? findings;
        case "GateResolution":
          return script.resolution;
        default:
          throw new Error("unexpected call");
      }
    },
  });
  return { model, service: new PlanningService({ model }) };
}

const names = (model: FakeModel) =>
  model.requests.map((r) => (r as ObjectRequest<unknown>).schemaName ?? "text");

function turn(
  text: string,
  overrides: Partial<AgentTurnInput> = {},
): AgentTurnInput {
  return {
    messages: [
      { role: "user", content: "Ana: we cannot hire Rust people here" },
      { role: "assistant", content: "Noted." },
      { role: "user", content: text },
    ],
    phase: "generated",
    checklist: [],
    document: draft,
    loadHistory: async () => [
      { role: "user", content: "Ana: we cannot hire Rust people here" },
      { role: "assistant", content: "Noted." },
      { role: "user", content: text },
    ],
    ...overrides,
  };
}

const rustSwap = {
  detected: true,
  summary: "Switch the indexer from Python to Rust.",
};
const rustDoc = draft.content.replace(
  'Chosen option: "Python", because the team knows it.',
  'Chosen option: "Rust".',
);

describe("goal lock", () => {
  it("finds the title, opening, summary and first problem statement", () => {
    expect(lockedGoal(draft)).toEqual({
      title: "Log search",
      intro: "Search incident logs quickly.",
      summary: "- Problem: on-call engineers grep logs by hand.",
      problem: "Which language do we write the indexer in?",
    });
  });

  it("lets anything outside the goal change", () => {
    expect(
      changedGoalParts(draft, { title: draft.title, content: rustDoc }),
    ).toEqual([]);
  });

  it("names each goal part that changes", () => {
    const moved = {
      title: "Metrics store",
      content: draft.content
        .replace("Search incident logs quickly.", "Store metrics.")
        .replace("grep logs by hand", "check dashboards")
        .replace("Which language do we write", "Where do we keep"),
    };
    expect(changedGoalParts(draft, moved)).toEqual([
      "the title",
      "the opening summary",
      "the Summary section",
      "the problem statement of the first decision",
    ]);
  });

  it("lets a part that did not exist yet be filled in", () => {
    const bare = { title: "T", content: "# T\n\n## Decision: X\n" };
    expect(changedGoalParts(bare, draft)).toEqual(["the title"]);
  });
});

describe("course change gate", () => {
  it("holds the edit, searches the history, and reports back without changing the document", async () => {
    const { service, model } = setup({
      edit: edit({ courseChange: rustSwap, content: rustDoc }),
    });
    const result = await service.runTurn(
      turn("Let's write it in Rust instead."),
    );
    expect(result.document).toBeNull();
    expect(result.gate).toMatchObject({
      kind: "course",
      proposal: "Let's write it in Rust instead.",
      summary: rustSwap.summary,
    });
    expect(names(model)).toEqual(["EditResult", "HistoryFindings", "text"]);
  });

  it("shows the main agent what the search found, with unverifiable quotes dropped", async () => {
    const { service, model } = setup({
      edit: edit({ courseChange: rustSwap, content: rustDoc }),
    });
    await service.runTurn(turn("Let's write it in Rust instead."));
    const report = model.requests[2].system ?? "";
    expect(report).toContain("we cannot hire Rust people here");
    expect(report).not.toContain("this sentence is not in the chat");
  });

  it("gives the search agent the whole history and the document", async () => {
    const { service, model } = setup({
      edit: edit({ courseChange: rustSwap, content: rustDoc }),
    });
    await service.runTurn(turn("Let's write it in Rust instead."));
    const search = model.requests[1].messages[0].content;
    expect(search).toContain("Ana: we cannot hire Rust people here");
    expect(search).toContain("Chosen option");
    expect(search).toContain("Let's write it in Rust instead.");
  });

  it("still holds the change when the search fails, and says it could not look", async () => {
    const { service, model } = setup({
      edit: edit({ courseChange: rustSwap, content: rustDoc }),
      findings: "fail",
    });
    const result = await service.runTurn(turn("Rust instead."));
    expect(result.document).toBeNull();
    expect(result.gate?.kind).toBe("course");
    expect(model.requests[2].system).toContain("search");
    expect(model.requests[2].system).toContain("failed");
  });

  it("does not hold an ordinary edit", async () => {
    const { service, model } = setup({});
    const result = await service.runTurn(turn("Add a risk about stale data."));
    expect(result.document?.content).toContain("Stale results.");
    expect(result.gate).toBeNull();
    expect(names(model)).toEqual(["EditResult"]);
  });
});

describe("goal lock gate", () => {
  const retitled = {
    title: "Metrics store",
    content: draft.content.replace("# Log search", "# Metrics store"),
  };

  it("holds an edit that rewrites the goal even when the model sees no course change", async () => {
    const { service } = setup({ edit: edit(retitled) });
    const result = await service.runTurn(turn("Make this about metrics."));
    expect(result.document).toBeNull();
    expect(result.gate).toMatchObject({ kind: "goal" });
    expect(result.gate?.summary).toContain("the title");
  });

  it("holds a revert that would restore a different goal", async () => {
    const { service } = setup({
      edit: edit({ action: "revert", title: null, content: null }),
    });
    const result = await service.runTurn(
      turn("undo that", { previousDocument: retitled }),
    );
    expect(result.document).toBeNull();
    expect(result.gate?.kind).toBe("goal");
  });
});

describe("answering a held change", () => {
  const held: PendingGate = {
    kind: "course",
    proposal: "Let's write it in Rust instead.",
    summary: rustSwap.summary,
  };
  const resolution = (overrides: Partial<GateResolution>): GateResolution => ({
    outcome: "proceed",
    acknowledgedPriorDiscussion: true,
    reason: "Throughput matters more than hiring now.",
    reply: "",
    ...overrides,
  });

  it("applies the change once the team acknowledges and gives a reason", async () => {
    const { service, model } = setup({
      resolution: resolution({}),
      edit: edit({ content: rustDoc }),
    });
    const result = await service.runTurn(
      turn("Yes I saw Ana's point. Throughput matters more.", { gate: held }),
    );
    expect(result.document?.content).toBe(rustDoc);
    expect(result.gate).toBeNull();
    expect(names(model)).toEqual(["GateResolution", "EditResult"]);
    const system = model.requests[1].system ?? "";
    expect(system).toContain("HELD CHANGE APPROVED");
    expect(system).toContain("Throughput matters more than hiring now.");
  });

  it("applies a cleared change even if the model still flags a course change", async () => {
    const { service } = setup({
      resolution: resolution({}),
      edit: edit({ courseChange: rustSwap, content: rustDoc }),
    });
    const result = await service.runTurn(
      turn("Yes, because speed.", { gate: held }),
    );
    expect(result.document?.content).toBe(rustDoc);
  });

  it("keeps holding when there is no reason, whatever the model says", async () => {
    const { service, model } = setup({
      resolution: resolution({ reason: "  ", reply: "" }),
    });
    const result = await service.runTurn(turn("Just do it.", { gate: held }));
    expect(result.document).toBeNull();
    expect(result.gate).toEqual(held);
    expect(result.reply).toMatch(/why/);
    expect(names(model)).toEqual(["GateResolution"]);
  });

  it("keeps holding when the earlier discussion was not acknowledged", async () => {
    const { service } = setup({
      resolution: resolution({ acknowledgedPriorDiscussion: false }),
    });
    const result = await service.runTurn(
      turn("Because speed.", { gate: held }),
    );
    expect(result.document).toBeNull();
    expect(result.gate).toEqual(held);
    expect(result.reply).toMatch(/seen the earlier discussion/);
  });

  it("uses the model's own words when the answer is unclear", async () => {
    const { service } = setup({
      resolution: resolution({
        outcome: "unclear",
        reason: null,
        reply: "Which part do you want to keep?",
      }),
    });
    const result = await service.runTurn(turn("hmm", { gate: held }));
    expect(result.reply).toBe("Which part do you want to keep?");
    expect(result.gate).toEqual(held);
  });

  it("drops the proposal when the team withdraws it", async () => {
    const { service, model } = setup({
      resolution: resolution({
        outcome: "withdraw",
        reply: "Okay, staying with Python.",
      }),
    });
    const result = await service.runTurn(turn("Never mind.", { gate: held }));
    expect(result.document).toBeNull();
    expect(result.gate).toBeNull();
    expect(result.reply).toBe("Okay, staying with Python.");
    expect(names(model)).toEqual(["GateResolution"]);
  });

  it("answers an unrelated message normally and keeps the proposal held", async () => {
    const { service, model } = setup({
      resolution: resolution({ outcome: "unrelated" }),
      edit: edit({
        action: "none",
        title: null,
        content: null,
        reply: "Two options.",
      }),
    });
    const result = await service.runTurn(
      turn("What options did we consider?", { gate: held }),
    );
    expect(result.reply).toBe("Two options.");
    expect(result.gate).toEqual(held);
    expect(names(model)).toEqual(["GateResolution", "EditResult"]);
  });

  it("holds a new course change that arrives while another is held", async () => {
    const { service } = setup({
      resolution: resolution({ outcome: "unrelated" }),
      edit: edit({
        courseChange: { detected: true, summary: "Use Go." },
        content: rustDoc,
      }),
    });
    const result = await service.runTurn(
      turn("Use Go instead.", { gate: held }),
    );
    expect(result.document).toBeNull();
    expect(result.gate).toMatchObject({
      kind: "course",
      proposal: "Use Go instead.",
    });
  });

  it("lets a locked goal change through only after a goal hold is cleared", async () => {
    const retitled = {
      title: "Metrics store",
      content: draft.content.replace("# Log search", "# Metrics store"),
    };
    const goalHold: PendingGate = {
      kind: "goal",
      proposal: "Make this about metrics.",
      summary: "This would change the title.",
    };
    const { service } = setup({
      resolution: resolution({}),
      edit: edit(retitled),
    });
    const result = await service.runTurn(
      turn("Yes, the project pivoted.", { gate: goalHold }),
    );
    expect(result.document).toEqual(retitled);
    expect(result.gate).toBeNull();
  });
});
