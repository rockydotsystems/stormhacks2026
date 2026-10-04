import { CORE_CHECKLIST_IDS } from "@/features/planning/contracts";

// The planning skill: the checklist the agent needs satisfied before it can write the plan.
// It is versioned. Every run records SKILL_VERSION so a draft traces to the checklist that produced it.
// Bump the version on any change to items, descriptions, criteria or triggers.

export const SKILL_VERSION = "2026-10-03.2";

export type SkillItem = {
  id: string;
  title: string;
  /** What the agent needs to learn. */
  description: string;
  /** What counts as covered. */
  covered: string;
  /** Extras only. The agent adds the item once this condition holds in the conversation. */
  trigger?: string;
};

export const CORE_ITEMS: SkillItem[] = [
  {
    id: "pain",
    title: "Pain",
    description: "The problem being solved and who feels it today.",
    covered:
      "A concrete problem, its current cost or workaround, and why it matters now.",
  },
  {
    id: "users",
    title: "Users",
    description: "Who will use the product and who else is affected.",
    covered: "Named user groups and what each needs to do.",
  },
  {
    id: "goals",
    title: "Goals",
    description: "The outcomes that define success.",
    covered:
      "Outcomes stated so that someone could later check whether they were met.",
  },
  {
    id: "scope",
    title: "Scope",
    description: "What is in the first version and what is explicitly out.",
    covered: "An in-scope list and an explicit out-of-scope list.",
  },
  {
    id: "requirements",
    title: "Requirements",
    description: "The behaviors the system must have.",
    covered:
      "Hard requirements separated from preferences, each specific enough to review code against.",
  },
  {
    id: "constraints",
    title: "Constraints",
    description:
      "Hard limits on the solution: architecture, policy, budget, time, compatibility. These become Decision Drivers in the document.",
    covered:
      "Each constraint is stated, with its reason, and marked as a hard limit or a preference.",
  },
  {
    id: "stack",
    title: "Stack",
    description: "Languages, frameworks, hosting and data stores in play.",
    covered:
      "The chosen technologies, or an explicit statement that the implementer decides.",
  },
  {
    id: "risks",
    title: "Risks",
    description:
      "What could go wrong, including failure cases and dependencies outside the team's control.",
    covered:
      "The main risks and failure cases are named, with how the system should behave when they occur.",
  },
  {
    id: "openChoices",
    title: "Open choices",
    description:
      "Decisions that are not made yet, and tradeoffs still being weighed. Each one becomes a Considered Options entry with no Decision Outcome in the document.",
    covered:
      "Every unresolved decision is listed with the options being weighed, or the user states that none remain.",
  },
];

export const EXTRA_ITEMS: SkillItem[] = [
  {
    id: "dataHandling",
    title: "Data handling",
    description:
      "What data the system stores or moves, where it may go, and who may see it.",
    covered:
      "Data categories, where each may be stored or sent, and any rule about leaving the approved boundary.",
    trigger:
      "The user mentions user data, personal or confidential information, or sending data to a third-party service or API.",
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Other systems this product must talk to.",
    covered:
      "Each named system, the direction of data flow, and who owns the interface.",
    trigger:
      "The user names another system, service or team this product depends on.",
  },
  {
    id: "scale",
    title: "Scale and performance",
    description: "Expected load, latency and growth.",
    covered:
      "Rough numbers for users, data volume or response time, or a statement that they do not matter yet.",
    trigger:
      "The user mentions numbers of users, data volume, speed, latency or growth.",
  },
];

export const SKILL_ITEMS: SkillItem[] = [...CORE_ITEMS, ...EXTRA_ITEMS];

export const CORE_IDS: readonly string[] = CORE_CHECKLIST_IDS;
export const EXTRA_IDS: readonly string[] = EXTRA_ITEMS.map((item) => item.id);

/** Ids the agent may report. Anything else is dropped by the server. */
export const ALLOWED_IDS: ReadonlySet<string> = new Set(
  SKILL_ITEMS.map((item) => item.id),
);
