import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/features/auth/server/config";

export async function GET() {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: "WorkOS authentication is not configured." },
      { status: 503 },
    );
  }
  redirect(await getSignInUrl());
}
