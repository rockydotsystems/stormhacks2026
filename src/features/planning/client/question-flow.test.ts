import { describe, expect, it } from "vitest";
import {
  canSubmit,
  finalAnswers,
  firstOpenStage,
  flowReducer,
  initialFlow,
  isReview,
  optionsFor,
  type FlowAction,
  type FlowState,
} from "@/features/planning/client/question-flow";

const questions = [
  { text: "Who searches?", suggestions: ["On-call engineers", "Support"] },
  { text: "How fast?", suggestions: ["Under a second"] },
];

function run(actions: FlowAction[], from = initialFlow(questions)) {
  return actions.reduce<FlowState>(flowReducer, from);
}

describe("question flow", () => {
  it("lists suggestions, then type your own, then skip last", () => {
    expect(optionsFor(initialFlow(questions)).map((o) => o.kind)).toEqual([
      "suggestion",
      "suggestion",
      "own",
      "skip",
    ]);
  });

  it("has one stage per question plus a review stage", () => {
    const state = run([{ type: "choose" }, { type: "choose" }]);
    expect(isReview(state)).toBe(true);
    expect(optionsFor(state).map((o) => o.kind)).toEqual(["submit", "back"]);
  });

  it("moves the highlight with arrows and stays inside the list", () => {
    const state = run([
      { type: "move", delta: -1 },
      { type: "move", delta: 1 },
      { type: "move", delta: 1 },
    ]);
    expect(state.cursor).toBe(2);
    expect(run([{ type: "move", delta: 99 }]).cursor).toBe(3);
  });

  it("records a chosen suggestion and advances", () => {
    const state = run([{ type: "move", delta: 1 }, { type: "choose" }]);
    expect(state.answers).toEqual(["Support", undefined]);
    expect(state.stage).toBe(1);
  });

  it("records a typed answer and ignores an empty one", () => {
    let state = run([{ type: "choose", index: 2 }]);
    expect(state.typing).toBe(true);
    state = run([{ type: "type", text: "   " }, { type: "commit" }], state);
    expect(state.stage).toBe(0);
    state = run(
      [{ type: "type", text: " Sales team " }, { type: "commit" }],
      state,
    );
    expect(state.answers[0]).toBe("Sales team");
    expect(state.typing).toBe(false);
    expect(state.stage).toBe(1);
  });

  it("leaves typing on cancel without changing the answer", () => {
    const state = run([
      { type: "choose", index: 2 },
      { type: "type", text: "draft" },
      { type: "cancel" },
    ]);
    expect(state.typing).toBe(false);
    expect(state.answers[0]).toBeUndefined();
  });

  it("skips with the last option", () => {
    const state = run([{ type: "choose", index: 3 }]);
    expect(state.answers[0]).toBeNull();
    expect(state.stage).toBe(1);
  });

  it("will not submit when every question was skipped", () => {
    const state = run([
      { type: "choose", index: 3 },
      { type: "choose", index: 2 },
    ]);
    expect(isReview(state)).toBe(true);
    expect(canSubmit(state)).toBe(false);
    expect(state.cursor).toBe(1);
  });

  it("returns answers with skips as null", () => {
    const state = run([
      { type: "choose", index: 0 },
      { type: "choose", index: 1 },
    ]);
    expect(finalAnswers(state)).toEqual(["On-call engineers", null]);
    expect(canSubmit(state)).toBe(true);
  });

  it("goes back and keeps the earlier choice highlighted", () => {
    const state = run([{ type: "choose", index: 1 }, { type: "back" }]);
    expect(state.stage).toBe(0);
    expect(state.cursor).toBe(1);
    expect(state.answers[0]).toBe("Support");
  });

  it("will not jump past a question that has no answer", () => {
    const state = run([{ type: "goto", stage: 2 }]);
    expect(state.stage).toBe(0);
    expect(firstOpenStage(state)).toBe(0);
  });

  it("freezes the highlight while typing", () => {
    const state = run([
      { type: "choose", index: 2 },
      { type: "move", delta: 1 },
      { type: "choose", index: 0 },
    ]);
    expect(state.cursor).toBe(2);
    expect(state.typing).toBe(true);
  });
});
