export type Session = {
  configured: boolean;
  user: { id: string; email: string; firstName: string | null } | null;
};
