import type { Question } from "@/features/planning/contracts";

// The staged question popup sends its answers back as one message, one `[number: answer]` line
// per question. A skipped question reads `[number: skipped]`, so the agent knows it was asked
// and the user chose not to answer.

export const SKIPPED = "skipped";

/** An answer is the text the user chose or typed. Null means the user skipped. */
export type Answer = string | null;

export function formatAnswers(answers: readonly Answer[]): string {
  return answers
    .map((answer, index) => {
      const text = answer?.replace(/\s+/g, " ").trim();
      return `[${index + 1}: ${text || SKIPPED}]`;
    })
    .join("\n");
}

export type ParsedAnswer = { number: number; answer: string; skipped: boolean };

const LINE = /^\[(\d{1,2}): (.+)\]$/;

/**
 * Reads a message made by formatAnswers. Returns null for anything else, so a user message the
 * person typed is never mistaken for answers.
 */
export function parseAnswers(text: string): ParsedAnswer[] | null {
  const lines = text.split("\n");
  const parsed: ParsedAnswer[] = [];
  for (const [index, line] of lines.entries()) {
    const match = LINE.exec(line);
    if (!match || Number(match[1]) !== index + 1) return null;
    parsed.push({
      number: index + 1,
      answer: match[2],
      skipped: match[2] === SKIPPED,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

/** Pairs each answer with the question it answers. Extra answers without a question are dropped. */
export function pairAnswers(
  questions: readonly Question[],
  answers: readonly ParsedAnswer[],
): { question: string; answer: string; skipped: boolean }[] {
  return answers.flatMap((item) => {
    const question = questions[item.number - 1];
    return question
      ? [
          {
            question: question.text,
            answer: item.answer,
            skipped: item.skipped,
          },
        ]
      : [];
  });
}
