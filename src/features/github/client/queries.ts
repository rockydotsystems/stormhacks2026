import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { GitHubConnection } from "../contracts";

export function useGitHubConnection(
  userId: string | undefined,
  organizationId: string,
) {
  return useQuery({
    queryKey: ["github", userId, organizationId],
    enabled: Boolean(userId && organizationId),
    queryFn: () =>
      apiClient<GitHubConnection>(
        `/api/github?organizationId=${organizationId}`,
      ),
  });
}

export function useGitHubSync(
  userId: string | undefined,
  organizationId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) =>
      apiClient("/api/github/sync", {
        method: "POST",
        body: JSON.stringify({ organizationId, installationId }),
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ["github", userId, organizationId],
        }),
        client.invalidateQueries({ queryKey: ["dashboard", userId] }),
      ]),
  });
}
