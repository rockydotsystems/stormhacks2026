"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncStandby } from "@/features/planning/client/api";
import {
  liveUrl,
  needsStandbySync,
  parseLiveMessage,
  reconnectDelay,
  type LiveUser,
} from "@/features/planning/client/live";
import { planningKeys } from "@/features/planning/client/queries";

const PING_MS = 25_000;
// Without a live connection, a shared chat still catches up by asking now and then.
const OFFLINE_POLL_MS = 10_000;
// A burst of changes (a message, then the agent's reply) becomes one reload.
const REFRESH_DELAY_MS = 120;

export type LiveConversation = {
  connected: boolean;
  // Who has the chat open right now, from the room. Empty until the first update arrives.
  users: LiveUser[];
};

/**
 * Keeps one conversation live for everyone who has it open. The room tells this client who is
 * here and when something changed. The client reloads the conversation from the server, which
 * stays the source of truth, so a missed message only means a slightly later reload.
 *
 * When the people present change in a way that should switch standby on or off, this asks the
 * server to check. The server looks at the room itself, so a client cannot force the switch.
 */
export function useLiveConversation(input: {
  conversationId: string | null;
  mode: "active" | "standby" | undefined;
  // Other people can join, so a missed update is worth polling for.
  shared: boolean;
}): LiveConversation {
  const { conversationId, shared } = input;
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveConversation>({
    connected: false,
    users: [],
  });
  const mode = useRef(input.mode);
  useEffect(() => {
    mode.current = input.mode;
  });

  useEffect(() => {
    if (!conversationId) return;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    let syncing = false;

    const reload = () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: planningKeys.conversation(conversationId),
        }),
        queryClient.invalidateQueries({
          queryKey: planningKeys.changes(conversationId),
        }),
      ]);

    const scheduleReload = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void reload(), REFRESH_DELAY_MS);
    };

    async function checkStandby(present: number) {
      if (syncing || !needsStandbySync(mode.current ?? "active", present))
        return;
      syncing = true;
      try {
        await syncStandby(conversationId as string);
        await reload();
      } catch {
        // The next presence change asks again, and the room's own update reloads the chat.
      } finally {
        syncing = false;
      }
    }

    function connect() {
      if (stopped) return;
      const next = new WebSocket(liveUrl(window.location, conversationId!));
      socket = next;
      next.onopen = () => {
        attempt = 0;
        setState((current) => ({ ...current, connected: true }));
        // Anything that happened while disconnected.
        void reload();
        ping = setInterval(() => {
          if (next.readyState === WebSocket.OPEN) next.send("ping");
        }, PING_MS);
      };
      next.onmessage = (event) => {
        const message = parseLiveMessage(event.data);
        if (!message) return;
        if (message.type === "presence") {
          setState((current) => ({ ...current, users: message.users }));
          void checkStandby(message.users.length);
        } else {
          scheduleReload();
        }
      };
      next.onclose = () => {
        clearInterval(ping);
        setState({ connected: false, users: [] });
        if (stopped) return;
        reconnect = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      };
      next.onerror = () => next.close();
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(reconnect);
      clearTimeout(refreshTimer);
      clearInterval(ping);
      socket?.close();
      setState({ connected: false, users: [] });
    };
  }, [conversationId, queryClient]);

  const { connected } = state;
  useEffect(() => {
    if (!conversationId || connected || !shared) return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: planningKeys.conversation(conversationId),
      });
    }, OFFLINE_POLL_MS);
    return () => clearInterval(timer);
  }, [conversationId, connected, shared, queryClient]);

  return state;
}
