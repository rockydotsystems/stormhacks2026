export const dashboardPaths = {
  Overview: "/",
  Projects: "/projects",
  Documents: "/documents",
} as const;

export type DashboardView = keyof typeof dashboardPaths;

export function projectPath(id: string) {
  return `${dashboardPaths.Projects}/${encodeURIComponent(id)}`;
}

export function documentPath(id: string) {
  return `${dashboardPaths.Documents}/${encodeURIComponent(id)}`;
}

export function dashboardRoute(pathname: string): {
  view: DashboardView;
  projectId: string | null;
  documentId: string | null;
} {
  const [section, resourceId] = pathname.split("/").slice(1);
  let id = resourceId || null;
  if (id) {
    try {
      id = decodeURIComponent(id);
    } catch {
      // A malformed copied URL should reach the missing-resource state.
    }
  }
  return {
    view:
      section === "projects"
        ? "Projects"
        : section === "documents"
          ? "Documents"
          : "Overview",
    projectId: section === "projects" ? id : null,
    documentId: section === "documents" ? id : null,
  };
}
