import "server-only";

// Participant names come from here, once, when someone joins. Messages never wait on it.
export interface UserDirectory {
  displayName(userId: string): Promise<string>;
}

const FALLBACK_NAME = "Teammate";

// "Ana Silva" shows as "Ana S.", so a shared chat names people without exposing full names.
export function formatDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) return `${first} ${last.charAt(0).toUpperCase()}.`;
  if (first) return first;
  const local = user.email?.split("@")[0]?.trim();
  return local || FALLBACK_NAME;
}

export class WorkOsUserDirectory implements UserDirectory {
  async displayName(userId: string): Promise<string> {
    try {
      // Loaded here so the pure name formatting above stays importable without AuthKit.
      const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
      const user = await getWorkOS().userManagement.getUser(userId);
      return formatDisplayName(user);
    } catch (error) {
      // A name is a convenience. A lookup failure must not block joining or sending.
      console.error("User directory lookup failed", error);
      return FALLBACK_NAME;
    }
  }
}
