"use client";

import Link from "next/link";
import { ChatTeardropTextIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useProjectChats, type ChatScope } from "../client/queries";
import { projectChatPath } from "../contracts";
import { cn } from "@/lib/utils";

export function ProjectChatList({
  scope,
  activeId,
  compact = false,
  onNavigate,
}: {
  scope: ChatScope;
  activeId?: string | null;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const chats = useProjectChats(scope);
  return (
    <section
      className={
        compact
          ? "sidebar-section sidebar-shortcuts"
          : "my-6 rounded-xl border p-4"
      }
      aria-label="Private project chats"
    >
      <div
        className={
          compact ? "" : "mb-3 flex items-center justify-between gap-3"
        }
      >
        <h2
          className={
            compact ? "" : "flex items-center gap-2 text-sm font-medium"
          }
        >
          {!compact && <LockSimpleIcon aria-hidden="true" />} Private chats
        </h2>
      </div>
      {!compact && (
        <p className="mb-3 text-sm text-muted-foreground">
          Ask why decisions changed across this project. Only you can see these
          chats; documents stay unchanged.
        </p>
      )}
      {chats.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading chats…
        </p>
      ) : chats.isError ? (
        <div role="alert">
          <p className="text-sm">{chats.error.message}</p>
          <Button variant="ghost" size="sm" onClick={() => chats.refetch()}>
            Try again
          </Button>
        </div>
      ) : chats.data.length ? (
        <nav aria-label="Private chats">
          <ul className={compact ? "" : "space-y-1"}>
            {chats.data.map((chat) => (
              <li key={chat.id}>
                <Button
                  variant="ghost"
                  className={cn(
                    compact ? "sidebar-item" : "w-full justify-start",
                    chat.id === activeId && "sidebar-item-active",
                  )}
                  render={
                    <Link
                      href={projectChatPath(scope.projectId, chat.id)}
                      onNavigate={onNavigate}
                    />
                  }
                  aria-current={chat.id === activeId ? "page" : undefined}
                  title={chat.title}
                >
                  <ChatTeardropTextIcon aria-hidden="true" />
                  <span className={cn("truncate", compact && "sidebar-label")}>
                    {chat.title}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p
          className={
            compact ? "sidebar-empty" : "text-sm text-muted-foreground"
          }
        >
          No private chats yet.
        </p>
      )}
    </section>
  );
}
