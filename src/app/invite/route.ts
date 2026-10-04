import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/features/auth/server/config";

export async function GET(request: Request) {
  if (!isAuthConfigured())
    return Response.json(
      { error: "WorkOS authentication is not configured." },
      { status: 503 },
    );
  const token = new URL(request.url).searchParams.get("invitation_token");
  if (!token || token.length > 512)
    return Response.json(
      { error: "Use the invitation link from your email." },
      { status: 400 },
    );
  // Retain AuthKit's state and PKCE cookies while forwarding the invitation.
  const url = new URL(await getSignInUrl());
  url.searchParams.set("invitation_token", token);
  redirect(url.toString());
}
