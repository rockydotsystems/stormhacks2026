import type { Decision, Project } from "./data";
import { filterDecisions as filter } from "./data";
export type { Decision, DecisionStatus, Project } from "./data";
export const initialProjects: Project[] = [
  {
    name: "Engineering",
    description: "Developer workflows, code reviews, and application delivery.",
    repositories: ["rockydotsystems/stormhacks2026"],
    organization: "Rocky Dot Systems",
  },
  {
    name: "Infrastructure",
    description: "Data storage, hosting, and the services we operate.",
    repositories: [
      "rockydotsystems/incident-search",
      "rockydotsystems/platform",
    ],
    organization: "Rocky Dot Systems",
  },
  {
    name: "Product",
    description: "Planning, collaboration, and the team's decision process.",
    repositories: [
      "rockydotsystems/stormhacks2026",
      "rockydotsystems/platform",
    ],
    organization: "Rocky Dot Systems",
  },
  {
    name: "Engineering",
    description: "Experiments and model evaluations.",
    repositories: [
      "rockydotsystems/experiments",
      "rockydotsystems/model-evaluations",
    ],
    organization: "Rocky Dot Labs",
  },
];

export const people: Record<
  string,
  { name: string; initials: string; photo: number }
> = {
  matthew: { name: "Matthew", initials: "MH", photo: 12 },
  sarah: { name: "Sarah Chen", initials: "SC", photo: 47 },
  alex: { name: "Alex Morgan", initials: "AM", photo: 13 },
  david: { name: "David Park", initials: "DP", photo: 60 },
  maya: { name: "Maya Patel", initials: "MP", photo: 44 },
};

export const initialDecisions: Decision[] = [
  {
    id: "adr-008",
    title: "Keep incident search inside our infrastructure",
    description:
      "Protect confidential incident data by running search and embeddings within the company boundary.",
    project: "Infrastructure",
    creator: "sarah",
    reviewers: ["matthew", "alex", "david"],
    status: "In review",
    updated: "2026-10-03T16:30:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-007",
    title: "PostgreSQL as our primary datastore",
    description:
      "Use a relational source of truth for documents, immutable published versions, and review history.",
    project: "Infrastructure",
    creator: "alex",
    reviewers: ["sarah", "david"],
    status: "Published",
    updated: "2026-10-03T14:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-006",
    title: "Human approval before binding a decision",
    description:
      "Make binding an explicit team action, with immutable snapshots and a traceable agreement.",
    project: "Product",
    creator: "matthew",
    reviewers: ["sarah", "maya"],
    status: "Draft",
    updated: "2026-10-02T18:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-005",
    title: "Request-scoped database connections",
    description:
      "Let Hyperdrive own the pool and dispose of database clients at the end of every request.",
    project: "Infrastructure",
    creator: "david",
    reviewers: ["alex", "matthew"],
    status: "In review",
    updated: "2026-10-02T15:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-004",
    title: "Advisory reviews for GitHub pull requests",
    description:
      "Surface deviations from agreed intent with evidence, while keeping merge decisions with the team.",
    project: "Engineering",
    creator: "maya",
    reviewers: ["sarah", "alex", "matthew"],
    status: "Published",
    updated: "2026-10-01T17:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-003",
    title: "Stable blocks for collaborative documents",
    description:
      "Apply proposals to whole document blocks so every change retains its discussion and rationale.",
    project: "Product",
    creator: "sarah",
    reviewers: ["maya", "alex"],
    status: "Draft",
    updated: "2026-09-30T16:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-002",
    title: "Cloudflare Workers for application hosting",
    description:
      "Run the App Router at the edge with vinext and use the same runtime in development and production.",
    project: "Engineering",
    creator: "matthew",
    reviewers: ["david", "alex"],
    status: "Published",
    updated: "2026-09-29T12:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-001",
    title: "One repository, one binding agreement",
    description:
      "Map each repository to an explicit decision document rather than guessing which plan applies.",
    project: "Engineering",
    creator: "alex",
    reviewers: ["sarah"],
    status: "Published",
    updated: "2026-09-28T12:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "labs-001",
    title: "Evaluate local models for planning sessions",
    description:
      "Compare latency, quality, and operating cost before choosing a model for the next prototype.",
    project: "Engineering",
    creator: "matthew",
    reviewers: ["alex"],
    status: "Draft",
    updated: "2026-10-02T12:00:00Z",
    organization: "Rocky Dot Labs",
  },
];

export function filterDecisions(
  decisions: Decision[],
  filters: Parameters<typeof filter>[1],
) {
  return filter(decisions, { userId: "matthew", people, ...filters });
}
