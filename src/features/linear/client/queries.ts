import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  DocumentLinearData,
  LinearConnectionData,
  LinearSyncResult,
  LinearTeam,
} from "../contracts";

export function useLinearConnection(
  userId: string | undefined,
  organizationId: string,
) {
  return useQuery({
    queryKey: ["linear", userId, organizationId],
    enabled: Boolean(userId && organizationId),
    queryFn: () =>
      apiClient<LinearConnectionData>(
        `/api/linear?organizationId=${organizationId}`,
      ),
  });
}

export function useLinearConnect(
  userId: string | undefined,
  organizationId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient("/api/linear/connect", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["linear", userId] }),
  });
}

export function useLinearDisconnect(
  userId: string | undefined,
  organizationId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient("/api/linear/disconnect", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["linear", userId] }),
  });
}

export function useDocumentLinear(
  userId: string,
  organizationId: string,
  docId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["document-linear", userId, organizationId, docId],
    enabled,
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient<DocumentLinearData>(
        `/api/documents/${docId}/linear?organizationId=${organizationId}`,
      ),
  });
}

export function useLinearTeams(organizationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["linear-teams", organizationId],
    enabled,
    retry: false,
    queryFn: () =>
      apiClient<{ teams: LinearTeam[] }>(
        `/api/linear/teams?organizationId=${organizationId}`,
      ).then((data) => data.teams),
  });
}

export function useLinearSync(
  userId: string,
  organizationId: string,
  docId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { teamId?: string }) =>
      apiClient<LinearSyncResult>(`/api/documents/${docId}/linear`, {
        method: "POST",
        body: JSON.stringify({ organizationId, ...input }),
      }),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: ["document-linear", userId, organizationId, docId],
      }),
  });
}
