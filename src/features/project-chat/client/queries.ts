import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ChatDetail, ChatEvent, ProjectChat } from "../contracts";
import { readChatStream } from "./stream";

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
export function useAskProjectChat(
  scope: ChatScope,
  id: string,
  onEvent: (event: ChatEvent) => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      content: string;
      clientMessageId: string;
      via: "text" | "voice";
      signal: AbortSignal;
    }) => {
      const { signal, ...question } = input;
      const response = await fetch(`/api/project-chats/${id}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        signal,
        body: JSON.stringify({
          ...question,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
        }),
      });
      return readChatStream(
        response,
        (event) => {
          if (event.type === "title") {
            client.setQueryData<ChatDetail>([...chatKey(scope), id], (chat) =>
              chat ? { ...chat, title: event.title } : chat,
            );
            client.setQueryData<ProjectChat[]>(chatKey(scope), (chats) =>
              chats?.map((chat) =>
                chat.id === id ? { ...chat, title: event.title } : chat,
              ),
            );
          }
          onEvent(event);
        },
        signal,
      );
    },
    onSuccess: (turn) => {
      client.setQueryData<ChatDetail>([...chatKey(scope), id], (chat) =>
        chat
          ? {
              ...chat,
              turns: chat.turns.some((item) => item.id === turn.id)
                ? chat.turns
                : [...chat.turns, turn],
            }
          : chat,
      );
      return client.invalidateQueries({ queryKey: chatKey(scope) });
    },
    onError: () => client.invalidateQueries({ queryKey: chatKey(scope) }),
  });
}
