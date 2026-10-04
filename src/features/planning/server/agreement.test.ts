import { describe, expect, it, vi } from "vitest";
import {
  AGREEMENT_QUESTIONS,
  AgreementDetector,
  MAX_DISCUSSION_MESSAGES,
  decide,
  discussionState,
  type DiscussionMessage,
} from "@/features/planning/server/agreement";
import { JevError, type JevPort } from "@/features/planning/server/jev";

const say = (
  authorUserId: string,
  authorName: string,
  text: string,
): DiscussionMessage => ({ authorUserId, authorName, text });

const ana = (text: string) => say("a", "Ana S.", text);
const ben = (text: string) => say("b", "Ben K.", text);

const scores = (agreement: number, objection: number, askedToUpdate = 0) => ({
  agreement,
  objection,
  askedToUpdate,
});

describe("decide", () => {
  it("agrees on clear agreement with no objection", () => {
    expect(decide(scores(0.96, 0.03))).toBe(true);
    expect(decide(scores(0.85, 0.2))).toBe(true);
  });

  it("does not agree on a lukewarm yes or a leftover objection", () => {
    expect(decide(scores(0.8, 0.03))).toBe(false);
    expect(decide(scores(0.99, 0.21))).toBe(false);
    expect(decide(scores(0.03, 0.9))).toBe(false);
  });

  it("accepts a little less certainty when someone asks for the update", () => {
    expect(decide(scores(0.75, 0.1, 0.9))).toBe(true);
    expect(decide(scores(0.75, 0.1, 0.5))).toBe(false);
    expect(decide(scores(0.6, 0.1, 0.99))).toBe(false);
  });

  it("an objection blocks even an explicit request", () => {
    expect(decide(scores(0.95, 0.5, 0.99))).toBe(false);
  });
});

describe("discussionState", () => {
  it("names the participants once and keeps who said what", () => {
    expect(
      discussionState([ana("Postgres?"), ben("Sure."), ana("Great.")]),
    ).toEqual({
      participants: ["Ana S.", "Ben K."],
      discussion: [
        { from: "Ana S.", text: "Postgres?" },
        { from: "Ben K.", text: "Sure." },
        { from: "Ana S.", text: "Great." },
      ],
    });
  });

  it("sends only the recent messages and trims very long ones", () => {
    const many = Array.from({ length: MAX_DISCUSSION_MESSAGES + 10 }, (_, i) =>
      ana(`message ${i}`),
    );
    const state = discussionState(many);
    expect(state.discussion).toHaveLength(MAX_DISCUSSION_MESSAGES);
    expect(state.discussion[0].text).toBe("message 10");
    expect(
      discussionState([ana("x".repeat(5000))]).discussion[0].text,
    ).toHaveLength(1200);
  });
});

describe("AgreementDetector", () => {
  function detector(answer: () => Promise<Record<string, number>>) {
    const askNouls = vi.fn(answer);
    return {
      askNouls,
      detector: new AgreementDetector({ askNouls } as unknown as JevPort),
    };
  }

  it("never asks the model when only one person has spoken, however it reads", async () => {
    const { detector: d, askNouls } = detector(async () => scores(1, 0, 1));
    const result = await d.check([
      ana("We all agree."),
      ana("Everyone agrees, update the doc."),
    ]);
    expect(result).toEqual({
      agreed: false,
      reason: "too-few-people",
      scores: null,
    });
    expect(askNouls).not.toHaveBeenCalled();
  });

  it("asks the three questions in one request about the discussion", async () => {
    const { detector: d, askNouls } = detector(async () => scores(0.96, 0.03));
    const messages = [ana("Postgres?"), ben("Sure."), ana("Great.")];
    const result = await d.check(messages);
    expect(result).toMatchObject({ agreed: true });
    expect(askNouls).toHaveBeenCalledTimes(1);
    expect(askNouls).toHaveBeenCalledWith(
      discussionState(messages),
      AGREEMENT_QUESTIONS,
    );
  });

  it("reports not agreed with the scores when they disagree", async () => {
    const { detector: d } = detector(async () => scores(0.03, 0.9));
    expect(await d.check([ana("Postgres?"), ben("No, Redis.")])).toEqual({
      agreed: false,
      reason: "not-agreed",
      scores: scores(0.03, 0.9),
    });
  });

  it("treats every kind of failure as not agreed and never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const error of [
      new JevError("unavailable", "down"),
      new JevError("config", "no key"),
      new Error("boom"),
    ]) {
      const { detector: d } = detector(async () => {
        throw error;
      });
      expect(await d.check([ana("a"), ben("b")])).toEqual({
        agreed: false,
        reason: "unavailable",
        scores: null,
      });
    }
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});
