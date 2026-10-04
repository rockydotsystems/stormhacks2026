"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createConversation,
  getChangeSource,
  getVersionSource,
  getConversation,
  getVersion,
  listChanges,
  listConversations,
  listVersions,
  publish,
  revert,
  streamMessage,
  type PlanningApiError,
  type StreamHandlers,
} from "@/features/planning/client/api";
import type {
  ConversationDetail,
  CreateConversationInput,
  PublishInput,
  RevertInput,
  SendMessageInput,
} from "@/features/planning/session-contracts";

export const planningKeys = {
  all: ["planning"] as const,
  conversations: () => [...planningKeys.all, "conversations"] as const,
  document: (documentId: string) =>
    [...planningKeys.all, "document", documentId] as const,
  conversation: (id: string) =>
    [...planningKeys.all, "conversation", id] as const,
  changes: (id: string) => [...planningKeys.all, "changes", id] as const,
  source: (id: string, changeId: string) =>
    [...planningKeys.all, "source", id, changeId] as const,
  versions: (id: string) => [...planningKeys.all, "versions", id] as const,
  version: (id: string, number: number) =>
    [...planningKeys.all, "version", id, number] as const,
};

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: planningKeys.conversations(),
    queryFn: listConversations,
    enabled,
  });
}

// The conversation that plans one document. The server creates it on first use and returns the
// same one afterwards, so asking is safe to repeat.
export function useDocumentConversation(input: {
  documentId: string;
  organizationId: string;
  title: string;
}) {
  return useQuery({
    queryKey: planningKeys.document(input.documentId),
    queryFn: () =>
      createConversation({
        projectName: input.title,
        documentId: input.documentId,
        organizationId: input.organizationId,
      }),
    staleTime: Infinity,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: planningKeys.conversation(id ?? "none"),
    queryFn: () => getConversation(id as string),
    enabled: id !== null,
  });
}

export function useChanges(id: string | null) {
  return useQuery({
    queryKey: planningKeys.changes(id ?? "none"),
    queryFn: () => listChanges(id as string),
    enabled: id !== null,
  });
}

export function useChangeSource(id: string | null, changeId: string | null) {
  return useQuery({
    queryKey: planningKeys.source(id ?? "none", changeId ?? "none"),
    queryFn: () => getChangeSource(id as string, changeId as string),
    enabled: id !== null && changeId !== null,
    // A change's source never changes, so it is safe to keep for the whole session.
    staleTime: Infinity,
  });
}

export function useVersionSource(
  id: string | null,
  number: number | "draft" | null,
  // A draft keeps growing, so its source can go stale. A published version never does.
  enabled = true,
) {
  return useQuery({
    queryKey: [...planningKeys.all, "version-source", id, number] as const,
    queryFn: () => getVersionSource(id as string, number as number | "draft"),
    enabled: id !== null && number !== null && enabled,
    staleTime: number === "draft" ? 0 : Infinity,
  });
}

export function useVersions(id: string | null, enabled = true) {
  return useQuery({
    queryKey: planningKeys.versions(id ?? "none"),
    queryFn: () => listVersions(id as string),
    enabled: id !== null && enabled,
  });
}

export function useVersion(id: string | null, number: number | null) {
  return useQuery({
    queryKey: planningKeys.version(id ?? "none", number ?? 0),
    queryFn: () => getVersion(id as string, number as number),
    enabled: id !== null && number !== null,
    // A published version is immutable.
    staleTime: Infinity,
  });
}

// What a turn or a publish changes: the conversation, the change list, and the sidebar order.
function refresh(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: planningKeys.conversation(id) }),
    queryClient.invalidateQueries({ queryKey: planningKeys.changes(id) }),
    queryClient.invalidateQueries({ queryKey: planningKeys.conversations() }),
  ]);
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation<
    ConversationDetail,
    PlanningApiError,
    CreateConversationInput
  >({
    mutationFn: createConversation,
    onSuccess: (detail) => {
      queryClient.setQueryData(planningKeys.conversation(detail.id), detail);
      void queryClient.invalidateQueries({
        queryKey: planningKeys.conversations(),
      });
    },
  });
}

export type SendMessageVariables = {
  conversationId: string;
  input: SendMessageInput;
  onReasoning?: (text: string) => void;
  onDelta?: (text: string) => void;
  onDocumentChanged?: StreamHandlers["onDocumentChanged"];
  signal?: AbortSignal;
};

// Streams one turn. Resending the same clientMessageId is safe, because the server returns the
// stored outcome. After success or failure the conversation reloads, since the user's message
// may be saved even when the reply failed.
export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      input,
      onReasoning,
      onDelta,
      onDocumentChanged,
      signal,
    }: SendMessageVariables) =>
      streamMessage(conversationId, input, {
        onReasoning,
        onDelta,
        onDocumentChanged,
        signal,
      }),
    onSettled: (_data, _error, { conversationId }) =>
      refresh(queryClient, conversationId),
  });
}

// Humans only. The server rejects a publish that is not ahead of the last version.
export function usePublish(id: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, PlanningApiError, PublishInput | undefined>({
    mutationFn: (input) => publish(id, input),
    onSuccess: () =>
      Promise.all([
        refresh(queryClient, id),
        queryClient.invalidateQueries({ queryKey: planningKeys.versions(id) }),
      ]),
  });
}

export function useRevert(id: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, PlanningApiError, RevertInput>({
    mutationFn: (input) => revert(id, input),
    onSuccess: () => refresh(queryClient, id),
  });
}
