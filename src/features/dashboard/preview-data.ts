export type DecisionStatus = "Draft" | "In review" | "Bound";
export type Decision = {
  id: string;
  title: string;
  description: string;
  collection: string;
  creator: string;
  reviewers: string[];
  status: DecisionStatus;
  updated: string;
  organization: string;
};

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
    collection: "Infrastructure",
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
      "Use a relational source of truth for documents, immutable bound versions, and review history.",
    collection: "Infrastructure",
    creator: "alex",
    reviewers: ["sarah", "david"],
    status: "Bound",
    updated: "2026-10-03T14:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-006",
    title: "Human approval before binding a decision",
    description:
      "Make binding an explicit team action, with immutable snapshots and a traceable agreement.",
    collection: "Product",
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
    collection: "Infrastructure",
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
    collection: "Engineering",
    creator: "maya",
    reviewers: ["sarah", "alex", "matthew"],
    status: "Bound",
    updated: "2026-10-01T17:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-003",
    title: "Stable blocks for collaborative documents",
    description:
      "Apply proposals to whole document blocks so every change retains its discussion and rationale.",
    collection: "Product",
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
    collection: "Engineering",
    creator: "matthew",
    reviewers: ["david", "alex"],
    status: "Bound",
    updated: "2026-09-29T12:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "adr-001",
    title: "One repository, one binding agreement",
    description:
      "Map each repository to an explicit decision document rather than guessing which plan applies.",
    collection: "Engineering",
    creator: "alex",
    reviewers: ["sarah"],
    status: "Bound",
    updated: "2026-09-28T12:00:00Z",
    organization: "Rocky Dot Systems",
  },
  {
    id: "labs-001",
    title: "Evaluate local models for planning sessions",
    description:
      "Compare latency, quality, and operating cost before choosing a model for the next prototype.",
    collection: "Engineering",
    creator: "matthew",
    reviewers: ["alex"],
    status: "Draft",
    updated: "2026-10-02T12:00:00Z",
    organization: "Rocky Dot Labs",
  },
];

export function filterDecisions(
  decisions: Decision[],
  filters: {
    organization: string;
    query: string;
    status: string;
    collection: string;
    view: string;
    sort: string;
  },
) {
  const query = filters.query.trim().toLowerCase();
  return decisions
    .filter(
      (decision) =>
        decision.organization === filters.organization &&
        (!query ||
          `${decision.title} ${decision.description} ${people[decision.creator].name}`
            .toLowerCase()
            .includes(query)) &&
        (filters.status === "All statuses" ||
          decision.status === filters.status) &&
        (filters.collection === "All collections" ||
          decision.collection === filters.collection) &&
        (filters.view !== "My reviews" ||
          (decision.status === "In review" &&
            decision.reviewers.includes("matthew"))) &&
        (filters.view !== "Bound decisions" || decision.status === "Bound") &&
        (filters.view !== "Created by me" || decision.creator === "matthew"),
    )
    .sort((a, b) =>
      filters.sort === "Name"
        ? a.title.localeCompare(b.title)
        : b.updated.localeCompare(a.updated),
    );
}
