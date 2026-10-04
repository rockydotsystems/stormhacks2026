"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("document-sort-preference", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("document-sort-preference", onChange);
  };
}

export function useDefaultDocumentSort(userId?: string) {
  const key = `why-document-sort:${userId || "guest"}`;
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "Name" ? "Name" : "Last updated";
      } catch {
        return "Last updated";
      }
    },
    () => "Last updated",
  );
  function update(next: string) {
    localStorage.setItem(key, next);
    window.dispatchEvent(new Event("document-sort-preference"));
  }
  return [value, update] as const;
}
