import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ChatDetail, ChatTurn, ProjectChat } from "../contracts";

export type ChatScope = {
  userId: string;
  organizationId: string;
  projectId: string;
};
function scopeQuery(scope: ChatScope) {
  return new URLSearchParams({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
  });
}
const chatKey = (scope: ChatScope) => [
  "project-chats",
  scope.userId,
  scope.organizationId,
  scope.projectId,
];

export function useProjectChats(scope: ChatScope) {
  return useQuery({
    queryKey: chatKey(scope),
    queryFn: () =>
      apiClient<ProjectChat[]>(`/api/project-chats?${scopeQuery(scope)}`),
    enabled: Boolean(scope.userId && scope.organizationId && scope.projectId),
  });
}
export function useCreateProjectChat(scope: ChatScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<ProjectChat>("/api/project-chats", {
        method: "POST",
        body: JSON.stringify({
          organizationId: scope.organizationId,
          projectId: scope.projectId,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: chatKey(scope) }),
  });
}
export function useProjectChat(scope: ChatScope, id: string) {
  return useQuery({
    queryKey: [...chatKey(scope), id],
    queryFn: () =>
      apiClient<ChatDetail>(`/api/project-chats/${id}?${scopeQuery(scope)}`),
  });
}
export function useAskProjectChat(scope: ChatScope, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      content: string;
      clientMessageId: string;
      via: "text" | "voice";
    }) =>
      apiClient<ChatTurn>(`/api/project-chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          ...input,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: chatKey(scope) }),
  });
}
