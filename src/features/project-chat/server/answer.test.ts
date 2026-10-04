import { describe, expect, it } from "vitest";
import { FakeModel } from "@/features/planning/server/fake.model";
import { answerQuestion, type SearchEvidence } from "./answer";

const evidence: SearchEvidence[] = [
  {
    id: "1",
    documentId: "doc",
    title: "Database decision",
    changeId: "42",
    version: 1,
    createdAt: "2026-10-04T00:00:00.000Z",
    href: "/documents/doc?change=42",
    isCurrent: false,
    content: "Use Postgres.",
    previousContent: "Use SQLite.",
    rationale: "We need concurrent writes.",
  },
];

describe("read-only project answers", () => {
  it("grounds answers in snapshot differences and recorded rationale with server-owned links", async () => {
    const model = new FakeModel({
      object: { answer: "Concurrency drove the change [1].", sourceIds: ["1"] },
    });
    const result = await answerQuestion(
      model,
      "Why Postgres?",
      [],
      evidence,
      new AbortController().signal,
    );
    expect(result).toEqual({
      answer: "Concurrency drove the change [1].",
      sources: [
        {
          id: "1",
          documentId: "doc",
          title: "Database decision",
          changeId: "42",
          version: 1,
          createdAt: evidence[0].createdAt,
          href: "/documents/doc?change=42",
        },
      ],
    });
    expect(model.requests[0].system).toContain("strictly read-only");
    expect(model.requests[0].system).toContain("do not invent intent");
    expect(model.requests[0].messages.at(-1)?.content).toContain(
      "concurrent writes",
    );
  });
  it("does not invent answers when retrieval finds no evidence", async () => {
    const model = new FakeModel();
    const result = await answerQuestion(
      model,
      "Why?",
      [],
      [],
      new AbortController().signal,
    );
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("couldn’t find a recorded decision");
    expect(model.requests).toHaveLength(0);
  });
  it.each([
    { answer: "Made up [99]", sourceIds: ["99"] },
    { answer: "Unverified [2]", sourceIds: ["1"] },
  ])("rejects fabricated citations", async (output) => {
    const model = new FakeModel({ object: output });
    await expect(
      answerQuestion(model, "Why?", [], evidence, new AbortController().signal),
    ).rejects.toThrow();
  });
  it("emits growing model text before returning the validated answer", async () => {
    const model = new FakeModel({
      object: { answer: "Concurrency drove the change [1].", sourceIds: ["1"] },
      chunkSize: 3,
    });
    const partials: string[] = [];
    const result = await answerQuestion(
      model,
      "Why?",
      [],
      evidence,
      new AbortController().signal,
      (text) => partials.push(text),
    );
    expect(partials.length).toBeGreaterThan(3);
    expect(partials[0]).toBe("Con");
    expect(partials.at(-1)).toBe(result.answer);
  });
  it("rejects invalid final citations even after provisional text has streamed", async () => {
    const model = new FakeModel({
      object: { answer: "Unverified [99].", sourceIds: ["99"] },
    });
    const partials: string[] = [];
    await expect(
      answerQuestion(
        model,
        "Why?",
        [],
        evidence,
        new AbortController().signal,
        (text) => partials.push(text),
      ),
    ).rejects.toThrow("unknown source");
    expect(partials.length).toBeGreaterThan(1);
  });
});
