import type { Question } from "@/features/planning/contracts";
import type { Answer } from "@/features/planning/client/answers";

// The staged question popup as a pure state machine. A round of q questions has q + 1 stages:
// one stage per question, then a last stage that reviews the answers and submits them.
// Every question stage lists the suggested answers, then "Type your own", then "Skip" last.

export type FlowOption =
  | { kind: "suggestion"; text: string }
  | { kind: "own" }
  | { kind: "skip" }
  | { kind: "submit" }
  | { kind: "back" };

export type FlowState = {
  questions: readonly Question[];
  stage: number;
  // The highlighted option of the current stage.
  cursor: number;
  // One entry per question. Undefined: not answered yet. Null: skipped.
  answers: (Answer | undefined)[];
  // The user is writing their own answer to the current question.
  typing: boolean;
  draft: string;
};

export type FlowAction =
  | { type: "move"; delta: number }
  | { type: "highlight"; index: number }
  | { type: "choose"; index?: number }
  | { type: "type"; text: string }
  | { type: "commit" }
  | { type: "cancel" }
  | { type: "back" }
  | { type: "goto"; stage: number };

export function initialFlow(questions: readonly Question[]): FlowState {
  return {
    questions,
    stage: 0,
    cursor: 0,
    answers: questions.map(() => undefined),
    typing: false,
    draft: "",
  };
}

export function isReview(state: FlowState): boolean {
  return state.stage >= state.questions.length;
}

export function optionsFor(state: FlowState): FlowOption[] {
  if (isReview(state)) return [{ kind: "submit" }, { kind: "back" }];
  return [
    ...state.questions[state.stage].suggestions.map((text): FlowOption => ({
      kind: "suggestion",
      text,
    })),
    { kind: "own" },
    { kind: "skip" },
  ];
}

/** Submit needs at least one real answer. A round of only skips says nothing. */
export function canSubmit(state: FlowState): boolean {
  return state.answers.some((answer) => typeof answer === "string");
}

export function finalAnswers(state: FlowState): Answer[] {
  return state.answers.map((answer) => answer ?? null);
}

// Where the highlight starts on a stage: the earlier choice when the user comes back to it.
function cursorFor(state: FlowState, stage: number): number {
  const next = { ...state, stage };
  if (isReview(next)) return canSubmit(next) ? 0 : 1;
  const options = optionsFor(next);
  const answer = state.answers[stage];
  if (answer === null) return options.length - 1;
  if (typeof answer === "string") {
    const found = options.findIndex(
      (option) => option.kind === "suggestion" && option.text === answer,
    );
    return found >= 0 ? found : options.length - 2;
  }
  return 0;
}

function enter(state: FlowState, stage: number): FlowState {
  const bounded = Math.max(0, Math.min(stage, state.questions.length));
  return {
    ...state,
    stage: bounded,
    cursor: cursorFor(state, bounded),
    typing: false,
    draft: "",
  };
}

function record(state: FlowState, answer: Answer): FlowState {
  const answers = [...state.answers];
  answers[state.stage] = answer;
  return enter({ ...state, answers }, state.stage + 1);
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "move": {
      if (state.typing) return state;
      const count = optionsFor(state).length;
      const next = Math.max(
        0,
        Math.min(state.cursor + action.delta, count - 1),
      );
      return { ...state, cursor: next };
    }
    case "highlight":
      return state.typing ? state : { ...state, cursor: action.index };
    case "choose": {
      if (state.typing) return state;
      const index = action.index ?? state.cursor;
      const option = optionsFor(state)[index];
      if (!option) return state;
      switch (option.kind) {
        case "suggestion":
          return record(state, option.text);
        case "skip":
          return record(state, null);
        case "own": {
          const previous = state.answers[state.stage];
          const draft =
            typeof previous === "string" &&
            !state.questions[state.stage].suggestions.includes(previous)
              ? previous
              : "";
          return { ...state, cursor: index, typing: true, draft };
        }
        case "back":
          return enter(state, state.stage - 1);
        case "submit":
          // The component reads the option and calls onSubmit. Nothing changes here.
          return state;
      }
    }
    case "type":
      return state.typing ? { ...state, draft: action.text } : state;
    case "commit": {
      if (!state.typing || !state.draft.trim()) return state;
      return record(state, state.draft.trim());
    }
    case "cancel":
      return state.typing ? { ...state, typing: false, draft: "" } : state;
    case "back":
      return state.stage === 0 ? state : enter(state, state.stage - 1);
    case "goto":
      // Only to a stage the user already reached, so a stage is never skipped without an answer.
      return action.stage <= firstOpenStage(state)
        ? enter(state, action.stage)
        : state;
  }
}

/** The earliest stage without an answer. The review stage when every question has one. */
export function firstOpenStage(state: FlowState): number {
  const open = state.answers.findIndex((answer) => answer === undefined);
  return open === -1 ? state.questions.length : open;
}
