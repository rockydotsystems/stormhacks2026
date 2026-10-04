import { CORE_CHECKLIST_IDS } from "@/features/planning/contracts";
import { describe, expect, it } from "vitest";
import {
  activeQuestions,
  chatItems,
  checklistProgress,
  checklistRows,
  errorText,
  initialTurnUi,
  isPublished,
  newestFirst,
  nextVersionNumber,
  allTopicsCovered,
  showConfirmButton,
  showTyping,
  titleFromPitch,
  turnReducer,
  type PendingTurn,
  type TurnUi,
} from "@/features/planning/client/state";
import type { MessageDto } from "@/features/planning/session-contracts";

const turn: PendingTurn = {
  clientMessageId: "22222222-2222-4222-8222-222222222222",
  text: "I want a bakery app",
  via: "text",
  speak: false,
};

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  questions: MessageDto["questions"] = null,
): MessageDto {
  return {
    id,
    role,
    authorUserId: role === "user" ? "user-1" : null,
    kind: "chat" as const,
    content,
    via: "text",
    questions,
    createdAt: "2026-10-03T12:00:00.000Z",
    producedChangeId: null,
  };
}

const sending = (): TurnUi =>
  turnReducer(initialTurnUi, { type: "send", turn });

describe("turnReducer", () => {
  it("starts a turn and collects streamed text", () => {
    let state = sending();
    expect(state.status).toBe("sending");
    state = turnReducer(state, { type: "delta", text: "Hel" });
    state = turnReducer(state, { type: "delta", text: "lo" });
    expect(state.streamText).toBe("Hello");
  });

  it("ignores a second send while one is in flight", () => {
    const state = sending();
    const other = { ...turn, text: "other" };
    expect(turnReducer(state, { type: "send", turn: other })).toBe(state);
  });

  it("clears everything but the reasoning when the turn succeeds", () => {
    let state = turnReducer(sending(), { type: "reasoning", text: "Hmm. " });
    state = turnReducer(state, { type: "reasoning", text: "Gaps in scope." });
    state = turnReducer(state, { type: "delta", text: "Reply" });
    expect(turnReducer(state, { type: "succeeded" })).toEqual({
      ...initialTurnUi,
      reasoningText: "Hmm. Gaps in scope.",
    });
  });

  it("collects reasoning only while a turn is running and clears it on the next", () => {
    expect(turnReducer(initialTurnUi, { type: "reasoning", text: "x" })).toBe(
      initialTurnUi,
    );
    const done = turnReducer(
      turnReducer(sending(), { type: "reasoning", text: "old" }),
      { type: "succeeded" },
    );
    expect(turnReducer(done, { type: "send", turn }).reasoningText).toBe("");
  });

  it("discards streamed text on failure and keeps the turn for a retry", () => {
    let state = turnReducer(sending(), { type: "delta", text: "partial" });
    state = turnReducer(state, {
      type: "failed",
      kind: "other",
      message: "No.",
    });
    expect(state).toMatchObject({
      status: "error",
      streamText: "",
      pending: turn,
      error: { kind: "other", message: "No." },
    });
    const retrying = turnReducer(state, { type: "retry" });
    expect(retrying.status).toBe("sending");
    // The same client message id goes out again, so the server can deduplicate.
    expect(retrying.pending?.clientMessageId).toBe(turn.clientMessageId);
  });

  it("dismisses an error and forgets the turn", () => {
    const failed = turnReducer(sending(), {
      type: "failed",
      kind: "auth",
      message: "x",
    });
    expect(turnReducer(failed, { type: "dismiss" })).toEqual(initialTurnUi);
  });

  it("ignores retry, delta and failure when they do not apply", () => {
    expect(turnReducer(initialTurnUi, { type: "retry" })).toBe(initialTurnUi);
    expect(turnReducer(initialTurnUi, { type: "delta", text: "x" })).toBe(
      initialTurnUi,
    );
    expect(
      turnReducer(initialTurnUi, {
        type: "failed",
        kind: "other",
        message: "x",
      }),
    ).toBe(initialTurnUi);
  });
});

describe("chatItems", () => {
  it("shows saved messages, then the pending message, then the streaming reply", () => {
    const saved = [
      message("1", "user", "hi"),
      message("2", "assistant", "hello"),
    ];
    let ui = sending();
    ui = turnReducer(ui, { type: "delta", text: "Thinking" });
    const items = chatItems(saved, ui);
    expect(items.map((i) => [i.role, i.content, i.streaming])).toEqual([
      ["user", "hi", false],
      ["assistant", "hello", false],
      ["user", "I want a bakery app", false],
      ["assistant", "Thinking", true],
    ]);
  });

  it("does not repeat a pending message the server already saved", () => {
    const saved = [message("9", "user", "I want a bakery app")];
    const failed = turnReducer(sending(), {
      type: "failed",
      kind: "other",
      message: "x",
    });
    expect(chatItems(saved, failed)).toHaveLength(1);
  });

  it("shows nothing extra when idle", () => {
    expect(chatItems([message("1", "user", "hi")], initialTurnUi)).toHaveLength(
      1,
    );
  });
});

describe("prompts and typing", () => {
  const withQuestions = message("2", "assistant", "Two things", [
    { text: "Who searches?", suggestions: ["On-call engineers"] },
  ]);

  it("offers suggestions only for the latest assistant message when idle", () => {
    expect(activeQuestions([withQuestions], initialTurnUi)).toHaveLength(1);
    expect(activeQuestions([withQuestions], sending())).toEqual([]);
    expect(
      activeQuestions(
        [withQuestions, message("3", "user", "ok")],
        initialTurnUi,
      ),
    ).toEqual([]);
  });

  it("shows the confirm button only while waiting for confirmation and idle", () => {
    expect(showConfirmButton("awaiting-confirmation", initialTurnUi)).toBe(
      true,
    );
    expect(showConfirmButton("awaiting-confirmation", sending())).toBe(false);
    expect(showConfirmButton("grilling", initialTurnUi)).toBe(false);
  });

  it("shows typing until text streams in", () => {
    expect(showTyping(sending())).toBe(true);
    expect(
      showTyping(turnReducer(sending(), { type: "delta", text: "a" })),
    ).toBe(false);
    expect(showTyping(initialTurnUi)).toBe(false);
  });
});

describe("text helpers", () => {
  it("builds a short title from the pitch", () => {
    expect(titleFromPitch("  Incident   search\nfor SREs ")).toBe(
      "Incident search for SREs",
    );
    expect(titleFromPitch("x".repeat(100))).toHaveLength(60);
    expect(titleFromPitch("x".repeat(100)).endsWith("...")).toBe(true);
  });

  it("maps error kinds to calm copy and passes other messages through", () => {
    expect(errorText("config", "raw")).toMatch(/not configured/);
    expect(errorText("auth", "raw")).toMatch(/Sign in/);
    expect(errorText("other", "Provider says no.")).toBe("Provider says no.");
  });
});

describe("checklist helpers", () => {
  it("always lists the core items, with extras after", () => {
    const rows = checklistRows([
      { id: "pain", status: "covered", evidence: "quote" },
      { id: "dataHandling", status: "partial", evidence: "open" },
    ]);
    expect(rows.slice(0, 3).map((r) => r.id)).toEqual([
      "pain",
      "users",
      "goals",
    ]);
    expect(rows.at(-1)).toMatchObject({
      id: "dataHandling",
      label: "Data handling",
      status: "partial",
    });
    expect(rows.find((r) => r.id === "users")?.status).toBe("missing");
    expect(checklistProgress(rows)).toEqual({ covered: 1, total: 10 });
  });
});

describe("document history helpers", () => {
  it("sorts change ids as numbers, not strings", () => {
    const sorted = newestFirst([{ id: "9" }, { id: "100" }, { id: "20" }]);
    expect(sorted.map((c) => c.id)).toEqual(["100", "20", "9"]);
    expect(
      newestFirst([
        { id: "9223372036854775806" },
        { id: "9223372036854775807" },
      ])[0].id,
    ).toBe("9223372036854775807");
  });

  it("numbers the next version and reads the working label", () => {
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber(3)).toBe(4);
    expect(isPublished("v2")).toBe(true);
    expect(isPublished("v0")).toBe(false);
    expect(isPublished("working, after v2")).toBe(false);
  });
});

describe("allTopicsCovered", () => {
  it("is false for an empty or partly covered checklist", () => {
    expect(allTopicsCovered([])).toBe(false);
    expect(
      allTopicsCovered([{ id: "pain", status: "covered", evidence: "x" }]),
    ).toBe(false);
  });

  it("is true only when every row is covered", () => {
    const all = CORE_CHECKLIST_IDS.map((id) => ({
      id,
      status: "covered" as const,
      evidence: "x",
    }));
    expect(allTopicsCovered(all)).toBe(true);
    expect(
      allTopicsCovered([
        { ...all[0], status: "partial" as const },
        ...all.slice(1),
      ]),
    ).toBe(false);
  });
});
