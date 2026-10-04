// Who counts as present in a chat. A person is present while any of their sockets is open, and
// for a short grace period after the last one closes, so a page refresh does not flicker the
// chat in and out of standby. These are pure functions so the rules can be tested without a
// Durable Object.

export type Member = { userId: string; displayName: string };

// Keyed by user id. `until` is the epoch millisecond when the grace period ends.
export type Leaving = Record<string, { displayName: string; until: number }>;

export const GRACE_MS = 10_000;

export function listPresence(
  connected: Member[],
  leaving: Leaving,
  now: number,
): Member[] {
  const byUser = new Map<string, Member>();
  for (const [userId, entry] of Object.entries(leaving)) {
    if (entry.until > now)
      byUser.set(userId, { userId, displayName: entry.displayName });
  }
  // A connected socket wins over a grace entry, and the latest name wins among sockets.
  for (const member of connected) byUser.set(member.userId, member);
  return [...byUser.values()].sort((a, b) => a.userId.localeCompare(b.userId));
}

export function startLeaving(
  leaving: Leaving,
  member: Member,
  now: number,
  graceMs: number = GRACE_MS,
): Leaving {
  return {
    ...leaving,
    [member.userId]: {
      displayName: member.displayName,
      until: now + graceMs,
    },
  };
}

export function stopLeaving(leaving: Leaving, userId: string): Leaving {
  if (!(userId in leaving)) return leaving;
  const { [userId]: _removed, ...rest } = leaving;
  return rest;
}

export function dropExpired(
  leaving: Leaving,
  now: number,
): { leaving: Leaving; changed: boolean } {
  const kept: Leaving = {};
  for (const [userId, entry] of Object.entries(leaving)) {
    if (entry.until > now) kept[userId] = entry;
  }
  return {
    leaving: kept,
    changed: Object.keys(kept).length !== Object.keys(leaving).length,
  };
}

// When the alarm should fire next, or null when nobody is in a grace period.
export function nextAlarm(leaving: Leaving): number | null {
  const times = Object.values(leaving).map((entry) => entry.until);
  return times.length === 0 ? null : Math.min(...times);
}
