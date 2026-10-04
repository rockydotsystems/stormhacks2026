import {
  JevError,
  type JevPort,
  type Noul,
} from "@/features/planning/server/jev";

// Decides whether the people in a standby discussion have reached an agreement.
//
// Jev answers three yes/no questions with a probability. Code decides. Jev reads questions
// literally and can be steered by the text it reads, so the probabilities are never enough on
// their own: at least two different people must have spoken, and a failure of any kind means
// "not agreed yet". A false negative costs a button press. A false positive edits the document.

export type DiscussionMessage = {
  authorUserId: string;
  authorName: string;
  text: string;
};

export type AgreementScores = {
  agreement: number;
  objection: number;
  askedToUpdate: number;
};

export type AgreementDecision =
  | { agreed: true; scores: AgreementScores }
  | {
      agreed: false;
      reason: "too-few-people" | "not-agreed" | "unavailable";
      scores: AgreementScores | null;
    };

// Calibrate against the live eval (agreement.live.test.ts) before changing these.
export const AGREEMENT_THRESHOLDS = {
  // The usual path: clear agreement and no remaining objection.
  // Live eval: every chat that is not an agreement scored at most 0.43, and every real agreement
  // at least 0.89, so 0.85 sits in a wide gap.
  agreement: 0.85,
  objection: 0.2,
  // When someone says outright "go ahead and update the document", a little less certainty
  // about the agreement is enough, but an objection still blocks.
  askedToUpdate: 0.8,
  agreementWhenAsked: 0.7,
  objectionWhenAsked: 0.3,
} as const;

// Jev loses accuracy as the state grows, and only the recent discussion matters.
export const MAX_DISCUSSION_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 1200;

export const AGREEMENT_QUESTIONS = {
  agreement: {
    instructions:
      "Have the participants in `discussion` agreed on one option or plan?",
    criteria: {
      true: "At least two participants have said they accept the same option or plan, and nobody has objected after that.",
      false:
        "The participants disagree, are still comparing options, have not answered each other, or only one participant has said they accept it.",
    },
  },
  objection: {
    instructions:
      "Does any participant in `discussion` still object to the latest proposal or say they are unsure about it?",
    criteria: {
      true: "A participant objects, asks to keep discussing, or says they are unsure.",
      false:
        "Every participant who spoke accepts the proposal, or nobody has objected to it.",
    },
  },
  askedToUpdate: {
    instructions:
      "Has any participant in `discussion` asked the agent to update the document now?",
    criteria: {
      true: "A participant tells the agent to update, write up, or apply what was discussed.",
      false: "Nobody has asked the agent to update the document.",
    },
  },
} satisfies Record<keyof AgreementScores, Noul>;

// The state Jev reads: who is talking and what they said, and nothing else.
export function discussionState(messages: DiscussionMessage[]) {
  const recent = messages.slice(-MAX_DISCUSSION_MESSAGES);
  const names = [...new Set(recent.map((message) => message.authorName))];
  return {
    participants: names,
    discussion: recent.map((message) => ({
      from: message.authorName,
      text: message.text.slice(0, MAX_MESSAGE_CHARS),
    })),
  };
}

export function distinctAuthors(messages: DiscussionMessage[]): number {
  return new Set(messages.map((message) => message.authorUserId)).size;
}

// Pure, so the rule can be tested and tuned without the model.
export function decide(scores: AgreementScores): boolean {
  const t = AGREEMENT_THRESHOLDS;
  if (scores.objection > t.objectionWhenAsked) return false;
  if (scores.agreement >= t.agreement && scores.objection <= t.objection)
    return true;
  return (
    scores.askedToUpdate >= t.askedToUpdate &&
    scores.agreement >= t.agreementWhenAsked
  );
}

export class AgreementDetector {
  constructor(private readonly jev: JevPort) {}

  async check(messages: DiscussionMessage[]): Promise<AgreementDecision> {
    // One person cannot agree with themselves, however the text reads.
    if (distinctAuthors(messages) < 2 || messages.length < 2)
      return { agreed: false, reason: "too-few-people", scores: null };
    let scores: AgreementScores;
    try {
      scores = await this.jev.askNouls(
        discussionState(messages),
        AGREEMENT_QUESTIONS,
      );
    } catch (error) {
      // Standby simply carries on, and a person can still press Apply.
      const kind = error instanceof JevError ? error.kind : "unknown";
      console.error(`Agreement check failed (${kind}).`);
      return { agreed: false, reason: "unavailable", scores: null };
    }
    return decide(scores)
      ? { agreed: true, scores }
      : { agreed: false, reason: "not-agreed", scores };
  }
}
