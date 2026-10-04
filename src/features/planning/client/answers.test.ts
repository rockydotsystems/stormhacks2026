import { describe, expect, it } from "vitest";
import {
  formatAnswers,
  pairAnswers,
  parseAnswers,
} from "@/features/planning/client/answers";

describe("formatAnswers", () => {
  it("writes one numbered line per question", () => {
    expect(formatAnswers(["On-call engineers", "Postgres"])).toBe(
      "[1: On-call engineers]\n[2: Postgres]",
    );
  });

  it("marks a skipped question and flattens line breaks", () => {
    expect(formatAnswers([null, "two\nlines   here", "  "])).toBe(
      "[1: skipped]\n[2: two lines here]\n[3: skipped]",
    );
  });
});

describe("parseAnswers", () => {
  it("round-trips what formatAnswers wrote", () => {
    const text = formatAnswers(["a", null, "c d"]);
    expect(parseAnswers(text)).toEqual([
      { number: 1, answer: "a", skipped: false },
      { number: 2, answer: "skipped", skipped: true },
      { number: 3, answer: "c d", skipped: false },
    ]);
  });

  it("does not read a typed message as answers", () => {
    expect(parseAnswers("I want incident search.")).toBeNull();
    expect(parseAnswers("[1: a]\nand more")).toBeNull();
    expect(parseAnswers("[2: out of order]")).toBeNull();
    expect(parseAnswers("")).toBeNull();
  });
});

describe("pairAnswers", () => {
  it("matches answers to questions by number", () => {
    const questions = [
      { text: "Who searches?", suggestions: [] },
      { text: "How fast?", suggestions: [] },
    ];
    const answers = parseAnswers("[1: Engineers]\n[2: skipped]")!;
    expect(pairAnswers(questions, answers)).toEqual([
      { question: "Who searches?", answer: "Engineers", skipped: false },
      { question: "How fast?", answer: "skipped", skipped: true },
    ]);
  });

  it("drops an answer with no matching question", () => {
    const answers = parseAnswers("[1: a]\n[2: b]")!;
    expect(
      pairAnswers([{ text: "Only one?", suggestions: [] }], answers),
    ).toHaveLength(1);
  });
});
