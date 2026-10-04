import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { TeamAction, TeamData } from "../contracts";

export function useTeam(userId: string, organizationId: string) {
  return useQuery({
    queryKey: ["team", userId, organizationId],
    enabled: Boolean(organizationId),
    queryFn: () =>
      apiClient<TeamData>(
        `/api/organizations/team?organizationId=${organizationId}`,
      ),
  });
}

export function useTeamAction(userId: string, organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: TeamAction) =>
      apiClient("/api/organizations/team", {
        method: "POST",
        body: JSON.stringify({ ...action, organizationId }),
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["team", userId, organizationId],
        }),
        client.invalidateQueries({ queryKey: ["dashboard", userId] }),
      ]),
  });
}
