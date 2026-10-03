import { useQuery } from "@tanstack/react-query";
import type { Session } from "@/features/auth/contracts";
import { apiClient } from "@/lib/api-client";

export function useSession() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => apiClient<Session>("/api/auth/session"),
  });
}
