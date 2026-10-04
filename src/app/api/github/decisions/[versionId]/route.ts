import { z } from "zod";
import { handleApi } from "@/server/http";
import { ApiError } from "@/server/errors";

// Links in GitHub reviews resolve the exact publication, never the current draft.
export const GET = (
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) =>
  handleApi(async ({ authService, githubReviewService }) => {
    const user = await authService.requireUser();
    const parsed = z.uuid().safeParse((await context.params).versionId);
    if (!parsed.success)
      throw new ApiError(404, "Published decision not found.");
    return Response.json(
      await githubReviewService.getDecision(user.id, parsed.data),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  });
