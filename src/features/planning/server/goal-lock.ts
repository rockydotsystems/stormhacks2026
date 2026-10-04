import type { DocumentDraft } from "@/features/planning/contracts";

// The goal of a document is fixed once the first draft exists. It is the title, the opening
// paragraph, the Summary section, and the Context and Problem Statement of the first decision.
// Everything else (options, outcomes, later decisions, open questions) stays editable. The
// server compares text, so a model cannot decide that a rewrite of the goal is fine.

export type LockedGoal = {
  title: string;
  intro: string;
  summary: string;
  problem: string;
};

const PROBLEM_HEADING = /^###\s+Context and Problem Statement\s*$/im;

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Splits the text before each heading of the given level. The first piece has no heading.
function sections(content: string, level: "##" | "###") {
  const pattern = new RegExp(`^${level}\\s+(.*)$`, "gm");
  const found: { heading: string; start: number; bodyStart: number }[] = [];
  for (const match of content.matchAll(pattern)) {
    found.push({
      heading: match[1].trim(),
      start: match.index,
      bodyStart: match.index + match[0].length,
    });
  }
  return found.map((entry, index) => ({
    heading: entry.heading,
    body: content.slice(
      entry.bodyStart,
      found[index + 1]?.start ?? content.length,
    ),
  }));
}

export function lockedGoal(document: DocumentDraft): LockedGoal {
  const content = document.content;
  const firstH2 = content.search(/^##\s/m);
  const head = firstH2 === -1 ? content : content.slice(0, firstH2);
  // Drop the H1 line itself. The title field carries it.
  const intro = squash(head.replace(/^#\s.*$/m, ""));
  const parts = sections(content, "##");
  const summary = parts.find((part) => /^summary$/i.test(part.heading));
  const decision = parts.find((part) => /^decision\b/i.test(part.heading));
  let problem = "";
  if (decision) {
    const own = sections(decision.body, "###").find((part) =>
      PROBLEM_HEADING.test(`### ${part.heading}`),
    );
    // A level-four heading ends the problem text as well.
    problem = squash((own?.body ?? "").split(/^####\s/m)[0]);
  }
  return {
    title: squash(document.title),
    intro,
    summary: squash(summary?.body ?? ""),
    problem,
  };
}

const LABELS: Record<keyof LockedGoal, string> = {
  title: "the title",
  intro: "the opening summary",
  summary: "the Summary section",
  problem: "the problem statement of the first decision",
};

/**
 * The parts of the goal that `after` changes. A part the old document did not have yet can be
 * filled in. Any part it had must stay as it was.
 */
export function changedGoalParts(
  before: DocumentDraft,
  after: DocumentDraft,
): string[] {
  const old = lockedGoal(before);
  const next = lockedGoal(after);
  return (Object.keys(old) as (keyof LockedGoal)[])
    .filter((key) => old[key] !== "" && old[key] !== next[key])
    .map((key) => LABELS[key]);
}
