import { authkitProxy } from "@workos-inc/authkit-nextjs";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import { isAuthConfigured } from "@/features/auth/server/config";

// API controllers enforce authentication with JSON 401s, not login redirects.
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isAuthConfigured()) return NextResponse.next();
  return authkitProxy()(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)",
  ],
};
