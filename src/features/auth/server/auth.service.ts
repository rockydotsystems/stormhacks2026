import "server-only";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "@/features/auth/server/config";
import type { Session } from "@/features/auth/contracts";
import { ApiError } from "@/server/errors";

export class AuthService {
  async getSession(): Promise<Session> {
    if (!isAuthConfigured()) return { configured: false, user: null };
    const { user, organizationId } = await withAuth();
    return {
      configured: true,
      organizationId: organizationId || null,
      user: user
        ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePictureUrl: user.profilePictureUrl,
          }
        : null,
    };
  }

  async requireUser() {
    const session = await this.getSession();
    if (!session.configured) {
      throw new ApiError(503, "WorkOS authentication is not configured.");
    }
    if (!session.user) throw new ApiError(401, "Sign in to continue.");
    return session.user;
  }
}
