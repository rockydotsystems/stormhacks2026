import { z } from "zod";
import { organizationIdSchema } from "@/features/organizations/contracts";

export const chatScopeSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: z.uuid(),
});
export const createChatSchema = chatScopeSchema.extend({
  title: z.string().trim().min(1).max(120).default("New chat"),
});
export const askChatSchema = chatScopeSchema.extend({
  content: z.string().trim().min(1).max(8000),
  clientMessageId: z.uuid(),
  via: z.enum(["text", "voice"]).default("text"),
});
export type ChatSource = {
  id: string;
  documentId: string;
  title: string;
  changeId: string;
  version: number | null;
  createdAt: string;
  href: string;
};
export type ProjectChat = {
  id: string;
  title: string;
  updatedAt: string;
};
export type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  via: "text" | "voice";
  sources: ChatSource[];
  createdAt: string;
};
export type ChatDetail = ProjectChat & { turns: ChatTurn[] };

export function projectChatPath(projectId: string, chatId: string) {
  return `/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}`;
}
