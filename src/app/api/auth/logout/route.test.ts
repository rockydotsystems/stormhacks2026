import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { POST } from "@/app/api/auth/logout/route";

const { getLogoutUrl } = vi.hoisted(() => ({ getLogoutUrl: vi.fn() }));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  getWorkOS: () => ({ userManagement: { getLogoutUrl } }),
}));

describe("POST logout", () => {
  beforeEach(() => {
    vi.stubEnv("WORKOS_API_KEY", "test-key");
    vi.stubEnv("WORKOS_CLIENT_ID", "test-client");
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", "x".repeat(32));
    vi.stubEnv(
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
      "http://localhost:3000/callback",
    );
    vi.stubEnv("WORKOS_COOKIE_NAME", "");
    vi.stubEnv("WORKOS_COOKIE_DOMAIN", "");
    vi.mocked(withAuth).mockResolvedValue({ user: null });
    getLogoutUrl.mockReturnValue(
      "https://api.workos.com/user_management/sessions/logout?session_id=test-session",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("redirects with 303, not a POST-preserving 307, and expires the session cookie", async () => {
    vi.mocked(withAuth).mockResolvedValue({
      user: null,
      sessionId: "test-session",
    } as unknown as Awaited<ReturnType<typeof withAuth>>);
    const response = await POST(
      new Request("http://localhost:3000/api/auth/logout", { method: "POST" }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "https://api.workos.com/user_management/sessions/logout?session_id=test-session",
    );
    expect(getLogoutUrl).toHaveBeenCalledWith({ sessionId: "test-session" });
    expect(response.headers.get("Set-Cookie")).toContain("wos-session=;");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(response.headers.get("Set-Cookie")).toContain("Path=/");
  });

  it("redirects an anonymous user home and respects a custom cookie name/domain", async () => {
    vi.stubEnv("WORKOS_COOKIE_NAME", "custom-session");
    vi.stubEnv("WORKOS_COOKIE_DOMAIN", ".example.com");
    const response = await POST(
      new Request("https://app.example.com/api/auth/logout", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://app.example.com/");
    expect(response.headers.get("Set-Cookie")).toContain("custom-session=;");
    expect(response.headers.get("Set-Cookie")).toContain("Domain=.example.com");
    expect(getLogoutUrl).not.toHaveBeenCalled();
  });

  it("fails closed when WorkOS is unconfigured", async () => {
    vi.stubEnv("WORKOS_API_KEY", "");
    const response = await POST(
      new Request("http://localhost:3000/api/auth/logout", { method: "POST" }),
    );
    expect(response.status).toBe(503);
    expect(withAuth).not.toHaveBeenCalled();
  });
});
