export type DecisionStatus = "Draft" | "In review" | "Bound";
export type Decision = {
  id: string;
  title: string;
  description: string;
  project: string;
  creator: string;
  reviewers: string[];
  repositories?: string[];
  status: DecisionStatus;
  updated: string;
  organization: string;
};

export type Project = {
  name: string;
  description: string;
  repositories: string[];
  organization: string;
};

export function filterDecisions(
  decisions: Decision[],
  filters: {
    organization: string;
    query: string;
    status: string[];
    project: string[];
    myReviews: boolean;
    scope: string | null;
    sort: string;
    userId?: string;
    people?: Record<string, { name: string }>;
  },
) {
  const query = filters.query.trim().toLowerCase();
  return decisions
    .filter(
      (decision) =>
        decision.organization === filters.organization &&
        (!query ||
          `${decision.title} ${decision.description} ${filters.people?.[decision.creator]?.name || ""}`
            .toLowerCase()
            .includes(query)) &&
        (!filters.status.length || filters.status.includes(decision.status)) &&
        (!filters.project.length ||
          filters.project.includes(decision.project)) &&
        (!filters.scope || decision.project === filters.scope) &&
        (!filters.myReviews ||
          (decision.status === "In review" &&
            decision.reviewers.includes(filters.userId || ""))),
    )
    .sort((a, b) =>
      filters.sort === "Name"
        ? a.title.localeCompare(b.title)
        : b.updated.localeCompare(a.updated),
    );
}
