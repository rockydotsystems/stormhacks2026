import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { isAuthConfigured } from "@/features/auth/server/config";

export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: "WorkOS authentication is not configured." },
      { status: 503 },
    );
  }
  return handleAuth({ returnPathname: "/" })(request);
}
