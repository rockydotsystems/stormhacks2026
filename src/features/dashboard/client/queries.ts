import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DashboardAction,
  DashboardData,
  DocumentData,
} from "../contracts";
import { apiClient } from "@/lib/api-client";

export function useDashboard(
  userId: string | undefined,
  organizationId: string | null,
) {
  return useQuery({
    queryKey: ["dashboard", userId, organizationId],
    queryFn: () =>
      apiClient<DashboardData>(
        `/api/dashboard${organizationId ? `?organizationId=${organizationId}` : ""}`,
      ),
    enabled: Boolean(userId),
  });
}
export function useDashboardAction(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DashboardAction) =>
      apiClient<{ id: string; projectId?: string }>("/api/dashboard", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["dashboard", userId] }),
  });
}
export function useDocument(
  userId: string,
  organizationId: string,
  id: string,
) {
  return useQuery({
    refetchOnWindowFocus: false,
    queryKey: ["document", userId, organizationId, id],
    queryFn: () =>
      apiClient<DocumentData>(
        `/api/documents/${id}?organizationId=${organizationId}`,
      ),
  });
}
export function useDocumentAction(
  userId: string,
  organizationId: string,
  id: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { action: "save"; title: string; content: string }
        | { action: "publish"; changeId: string }
        | { action: "update"; title?: string; description?: string }
        | { action: "delete"; confirmTitle: string },
    ) =>
      apiClient(`/api/documents/${id}`, {
        method: "POST",
        body: JSON.stringify({ ...input, organizationId }),
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["dashboard", userId] }),
        client.invalidateQueries({
          queryKey: ["document", userId, organizationId, id],
        }),
      ]),
  });
}
export function useProjectAction(
  userId: string,
  organizationId: string,
  id: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { action: "update"; name?: string; description?: string }
        | { action: "setRepositories"; repositoryIds: string[] }
        | { action: "delete"; confirmName: string },
    ) =>
      apiClient(`/api/projects/${id}`, {
        method: "POST",
        body: JSON.stringify({ ...input, organizationId }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["dashboard", userId] }),
  });
}
