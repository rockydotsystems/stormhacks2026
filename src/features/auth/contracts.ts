export type Session = {
  configured: boolean;
  organizationId?: string | null;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profilePictureUrl: string | null;
  } | null;
};
