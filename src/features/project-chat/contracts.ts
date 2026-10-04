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

const sourceSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  title: z.string(),
  changeId: z.string(),
  version: z.number().nullable(),
  createdAt: z.string(),
  href: z.string().startsWith("/documents/"),
});
export const chatTurnSchema: z.ZodType<ChatTurn> = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string().max(4000),
  via: z.enum(["text", "voice"]),
  sources: z.array(sourceSchema),
  createdAt: z.string(),
});
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), title: z.string().min(1).max(120) }),
  z.object({ type: z.literal("answer"), text: z.string().max(4000) }),
  z.object({ type: z.literal("done"), turn: chatTurnSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatProgress = Extract<ChatEvent, { type: "title" | "answer" }>;

export function projectChatPath(projectId: string, chatId: string) {
  return `/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}`;
}
