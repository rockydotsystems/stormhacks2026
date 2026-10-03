import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/features/auth/server/config";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: "WorkOS authentication is not configured." },
      { status: 503 },
    );
  }

  const { sessionId } = await withAuth();
  const destination = sessionId
    ? getWorkOS().userManagement.getLogoutUrl({ sessionId })
    : new URL("/", request.url);

  // AuthKit's signOut() uses Next's 307 in route handlers. A form POST needs
  // an explicit 303 so the browser follows the WorkOS logout URL with GET.
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set({
    name: process.env.WORKOS_COOKIE_NAME || "wos-session",
    value: "",
    path: "/",
    domain: process.env.WORKOS_COOKIE_DOMAIN || undefined,
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
  });
  return response;
}
