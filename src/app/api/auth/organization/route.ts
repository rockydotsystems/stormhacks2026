import { getSignInUrl, refreshSession } from "@workos-inc/authkit-nextjs";
import { organizationIdSchema } from "@/features/organizations/contracts";
import { requireOrganizationMember } from "@/features/organizations/server/membership";
import { handleApi } from "@/server/http";
import { ApiError } from "@/server/errors";

export async function POST(request: Request) {
  return handleApi(async (dependencies) => {
    const user = await dependencies.authService.requireUser();
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      throw new ApiError(415, "Content-Type must be application/json.");
    const body: unknown = await request.json().catch(() => null);
    const parsed = organizationIdSchema.safeParse(
      body && typeof body === "object" && "organizationId" in body
        ? body.organizationId
        : null,
    );
    if (!parsed.success)
      throw new ApiError(400, "Use a valid WorkOS organization ID.");
    const organizationId = parsed.data;
    await requireOrganizationMember(dependencies.db, {
      userId: user.id,
      organizationId,
    });
    try {
      const session = await refreshSession({ organizationId });
      if (!session.user || session.organizationId !== organizationId)
        throw new ApiError(401, "Sign in to this organization to continue.");
      return Response.json(
        { organizationId },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      // An organization's SSO/MFA policy can require a fresh hosted sign-in.
      const cause = error instanceof Error ? error.cause : null;
      if (
        cause &&
        typeof cause === "object" &&
        "error" in cause &&
        (cause.error === "sso_required" || cause.error === "mfa_enrollment")
      ) {
        return Response.json(
          {
            redirectUrl: await getSignInUrl({
              organizationId,
              returnTo: "/",
            }),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "Could not switch organizations. Please try again.",
      );
    }
  });
}
