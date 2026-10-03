import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateNote, Note } from "@/features/notes/contracts";
import { apiClient } from "@/lib/api-client";

export function useNotes(userId: string | undefined) {
  return useQuery({
    queryKey: ["notes", userId],
    queryFn: () => apiClient<Note[]>("/api/notes"),
    enabled: Boolean(userId),
  });
}

export function useCreateNote(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNote) =>
      apiClient<Note>("/api/notes", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notes", userId] }),
  });
}
