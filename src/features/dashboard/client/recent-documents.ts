"use client";
import { useSyncExternalStore } from "react";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("recent-documents", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("recent-documents", callback);
  };
}
export function useRecentDocuments(
  userId: string | undefined,
  organizationId: string,
) {
  const key = `why-recents:${userId}:${organizationId}`;
  const stored = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) || "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed))
      ids = parsed
        .filter((id): id is string => typeof id === "string")
        .slice(0, 5);
  } catch {
    /* Ignore malformed device history. */
  }
  function record(id: string) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify([id, ...ids.filter((item) => item !== id)].slice(0, 5)),
      );
      window.dispatchEvent(new Event("recent-documents"));
    } catch {
      /* Browsing remains available when device storage is disabled. */
    }
  }
  return [ids, record] as const;
}
