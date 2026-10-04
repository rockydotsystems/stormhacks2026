import "server-only";
import { getWorkOS } from "@stormhacks/data/organizations/workos";
import { ApiError } from "@/server/errors";

export const PIPES_PROVIDER = "linear";

export interface LinearTokenSource {
  /** A fresh Linear access token for a user's WorkOS Pipes connection. */
  get(userId: string, organizationId: string): Promise<string>;
}

/**
 * WorkOS Pipes owns the Linear OAuth app, the consent screen, token storage, and refresh. A
 * connection belongs to a user, optionally scoped to an organization, so the admin who
 * connected Linear lends that connection to the whole organization.
 */
export class PipesTokens implements LinearTokenSource {
  private async attempt(userId: string, organizationId: string | null) {
    try {
      return await getWorkOS().pipes.getAccessToken({
        provider: PIPES_PROVIDER,
        userId,
        organizationId,
      });
    } catch {
      return null;
    }
  }

  async get(userId: string, organizationId: string) {
    // The widget connects within the session's organization, and a connection can also be
    // user-level. Prefer the organization-scoped one.
    const scoped = await this.attempt(userId, organizationId);
    const result = scoped?.active
      ? scoped
      : ((await this.attempt(userId, null)) ?? scoped);
    if (!result)
      throw new ApiError(502, "WorkOS could not be reached. Retry the sync.");
    if (!result.active)
      throw new ApiError(
        409,
        result.error === "needs_reauthorization"
          ? "The Linear connection needs to be authorized again. An admin must reconnect Linear in Settings."
          : "Linear is not connected. An admin must connect Linear in Settings.",
      );
    const missing = result.accessToken.missingScopes;
    if (missing.length)
      throw new ApiError(
        409,
        `The Linear connection is missing permissions (${missing.join(", ")}). An admin must reconnect Linear.`,
      );
    return result.accessToken.accessToken;
  }
}
