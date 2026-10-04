export type OrganizationActor = { organizationId: string; userId: string };

export type TeamData = {
  canManageMembers: boolean;
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: "admin" | "member";
    directoryManaged: boolean;
  }>;
  invitations: Array<{ id: string; email: string; expiresAt: string }>;
};

export type TeamAction =
  | { action: "invite"; email: string }
  | { action: "role"; membershipId: string; role: "admin" | "member" }
  | { action: "remove"; membershipId: string }
  | { action: "resend"; invitationId: string }
  | { action: "revoke"; invitationId: string };
