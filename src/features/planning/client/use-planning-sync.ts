"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useConversations } from "@/features/planning/client/queries";
import type { ConversationListItem } from "@/features/planning/session-contracts";

// The sidebar item shape the shell keeps for every conversation. Planning conversations that
// exist on the server carry their server id.
type SidebarItem = {
  id: string;
  title: string;
  kind?: "planning";
  serverId?: string;
};

// Keeps the shell's conversation list in step with the server. Saved planning conversations
// appear after a reload, newest first, ahead of the sample conversations. A conversation that
// the shell already has (matched by server id) only gets its title refreshed. A signed-out
// user gets no server conversations, and the list stays as it is.
export function usePlanningSync<T extends SidebarItem>(
  setItems: Dispatch<SetStateAction<T[]>>,
  create: (item: ConversationListItem) => T,
) {
  const list = useConversations();
  const server = list.data;

  useEffect(() => {
    if (!server) return;
    setItems((items) => {
      const known = new Map(
        items.flatMap((item) =>
          item.serverId ? [[item.serverId, item] as const] : [],
        ),
      );
      const titles = new Map(server.map((entry) => [entry.id, entry.title]));
      const updated = items.map((item) => {
        const title = item.serverId ? titles.get(item.serverId) : undefined;
        return title && title !== item.title ? { ...item, title } : item;
      });
      const added = server
        .filter((entry) => !known.has(entry.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(create);
      if (added.length === 0 && updated.every((item, i) => item === items[i])) {
        return items;
      }
      // Unsaved planning conversations first, then saved ones, then the samples.
      const unsaved = updated.filter(
        (i) => i.kind === "planning" && !i.serverId,
      );
      const saved = updated.filter((i) => i.kind === "planning" && i.serverId);
      const rest = updated.filter((i) => i.kind !== "planning");
      return [...unsaved, ...saved, ...added, ...rest];
    });
    // `create` is a stable factory supplied by the shell, so only server data drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, setItems]);
}
