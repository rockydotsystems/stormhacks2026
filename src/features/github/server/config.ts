import "server-only";
import { ApiError } from "@/server/errors";

export function getGitHubConfig() {
  const {
    GITHUB_APP_ID,
    GITHUB_APP_SLUG,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET,
  } = process.env;
  if (
    !GITHUB_APP_ID ||
    !GITHUB_APP_SLUG ||
    !GITHUB_CLIENT_ID ||
    !GITHUB_CLIENT_SECRET ||
    !GITHUB_PRIVATE_KEY ||
    !GITHUB_WEBHOOK_SECRET
  ) {
    throw new ApiError(503, "GitHub integration is not configured.");
  }
  return {
    appId: GITHUB_APP_ID,
    slug: GITHUB_APP_SLUG,
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    privateKey: GITHUB_PRIVATE_KEY.replaceAll("\\n", "\n"),
    webhookSecret: GITHUB_WEBHOOK_SECRET,
  };
}

export function isGitHubConfigured() {
  try {
    getGitHubConfig();
    return true;
  } catch {
    return false;
  }
}

export function appOrigin() {
  const redirect = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!redirect)
    throw new ApiError(503, "Application origin is not configured.");
  return new URL(redirect).origin;
}
