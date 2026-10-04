"use client";

import { useEffect, useId, useReducer, useRef } from "react";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { Answer } from "@/features/planning/client/answers";
import {
  canSubmit,
  finalAnswers,
  firstOpenStage,
  flowReducer,
  initialFlow,
  isReview,
  optionsFor,
  type FlowOption,
} from "@/features/planning/client/question-flow";
import type { Question } from "@/features/planning/contracts";
import { cn } from "@/lib/utils";

function optionLabel(option: FlowOption): string {
  switch (option.kind) {
    case "suggestion":
      return option.text;
    case "own":
      return "Type your own answer";
    case "skip":
      return "Skip this question";
    case "submit":
      return "Submit answers";
    case "back":
      return "Go back and change an answer";
  }
}

/**
 * The agent's questions, one stage at a time, above the message box. A round of q questions has
 * q + 1 stages. The last stage reviews and submits. Arrow keys move, Enter picks, and the last
 * option of every question skips it. Number keys pick an option directly.
 */
export function QuestionPrompt({
  questions,
  onSubmit,
  onDismiss,
}: {
  questions: readonly Question[];
  onSubmit: (answers: Answer[]) => void;
  onDismiss: () => void;
}) {
  const [state, dispatch] = useReducer(flowReducer, questions, initialFlow);
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const options = optionsFor(state);
  const review = isReview(state);
  const submittable = canSubmit(state);
  const reached = firstOpenStage(state);
  const total = questions.length;

  // Keyboard focus follows the stage, so arrows keep working after each pick.
  useEffect(() => {
    if (!state.typing) root.current?.focus({ preventScroll: true });
  }, [state.stage, state.typing]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === "submit") {
      if (submittable) onSubmit(finalAnswers(state));
      return;
    }
    dispatch({ type: "choose", index });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (state.typing || event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        dispatch({ type: "move", delta: 1 });
        break;
      case "ArrowUp":
        dispatch({ type: "move", delta: -1 });
        break;
      case "ArrowLeft":
        dispatch({ type: "back" });
        break;
      case "ArrowRight":
        if (state.stage < reached) {
          dispatch({ type: "goto", stage: state.stage + 1 });
        }
        break;
      case "Enter":
        choose(state.cursor);
        break;
      case "Escape":
        onDismiss();
        break;
      default: {
        const digit = Number(event.key);
        if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
          choose(digit - 1);
          break;
        }
        return;
      }
    }
    event.preventDefault();
  }

  return (
    <div
      ref={root}
      className="planning-questions"
      role="group"
      aria-labelledby={titleId}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="planning-questions-head">
        <ol className="planning-questions-steps" aria-label="Questions">
          {Array.from({ length: total + 1 }, (_, stage) => {
            const done = stage < total && state.answers[stage] !== undefined;
            return (
              <li key={stage}>
                <button
                  type="button"
                  className="planning-questions-step"
                  data-active={stage === state.stage || undefined}
                  data-done={done || undefined}
                  disabled={stage > reached}
                  aria-label={
                    stage < total
                      ? `Question ${stage + 1}`
                      : "Review and submit"
                  }
                  aria-current={stage === state.stage ? "step" : undefined}
                  onClick={() => dispatch({ type: "goto", stage })}
                >
                  {stage < total ? (
                    done ? (
                      <CheckIcon aria-hidden="true" weight="bold" />
                    ) : (
                      stage + 1
                    )
                  ) : (
                    <ArrowUpIcon aria-hidden="true" weight="bold" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Answer in the chat instead"
          onClick={onDismiss}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      <p id={titleId} className="planning-questions-title">
        {review
          ? "Review your answers"
          : `${state.stage + 1} of ${total}. ${questions[state.stage].text}`}
      </p>

      {review ? (
        <ul className="planning-questions-review">
          {questions.map((question, index) => {
            const answer = state.answers[index];
            return (
              <li key={question.text}>
                <span>{question.text}</span>
                <strong data-skipped={typeof answer !== "string" || undefined}>
                  {typeof answer === "string" ? answer : "Skipped"}
                </strong>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ul
        className="planning-questions-options"
        role="listbox"
        aria-label="Answers"
      >
        {options.map((option, index) => {
          const active = index === state.cursor;
          const typing = state.typing && option.kind === "own";
          const disabled = option.kind === "submit" && !submittable;
          return (
            <li
              key={`${option.kind}-${index}`}
              role="option"
              aria-selected={active}
              aria-disabled={disabled || undefined}
              data-active={active || undefined}
              data-kind={option.kind}
              className={cn("planning-questions-option")}
              onMouseEnter={() => dispatch({ type: "highlight", index })}
              onClick={() => {
                if (!disabled && !typing) choose(index);
              }}
            >
              <kbd aria-hidden="true">{index + 1}</kbd>
              {typing ? (
                <textarea
                  autoFocus
                  rows={1}
                  className="planning-questions-input"
                  aria-label="Your answer"
                  placeholder="Type your answer, then press Enter"
                  value={state.draft}
                  onChange={(event) =>
                    dispatch({ type: "type", text: event.target.value })
                  }
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      dispatch({ type: "commit" });
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      dispatch({ type: "cancel" });
                    }
                  }}
                />
              ) : (
                <span>{optionLabel(option)}</span>
              )}
              {option.kind === "own" && !typing ? (
                <PencilSimpleIcon aria-hidden="true" />
              ) : null}
              {option.kind === "back" ? (
                <ArrowLeftIcon aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="planning-questions-hint">
        <kbd>↑</kbd>
        <kbd>↓</kbd> choose <kbd>Enter</kbd> select <kbd>Shift</kbd>
        <kbd>Enter</kbd> new line <kbd>←</kbd> back <kbd>Esc</kbd> answer in
        chat
      </p>
    </div>
  );
}
