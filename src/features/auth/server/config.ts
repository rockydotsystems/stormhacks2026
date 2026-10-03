import "server-only";

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_COOKIE_PASSWORD &&
    process.env.WORKOS_COOKIE_PASSWORD.length >= 32 &&
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  );
}
