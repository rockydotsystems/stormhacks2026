import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AuthService } from "@/features/auth/server/auth.service";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

describe("AuthService", () => {
  beforeEach(() => {
    vi.stubEnv("WORKOS_API_KEY", "test-key");
    vi.stubEnv("WORKOS_CLIENT_ID", "test-client");
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", "x".repeat(32));
    vi.stubEnv(
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
      "http://localhost:3000/callback",
    );
    vi.mocked(withAuth).mockResolvedValue({ user: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("fails closed when credentials are missing", async () => {
    vi.stubEnv("WORKOS_API_KEY", "");
    const service = new AuthService();
    expect(await service.getSession()).toEqual({
      configured: false,
      user: null,
    });
    await expect(service.requireUser()).rejects.toMatchObject({ status: 503 });
    expect(withAuth).not.toHaveBeenCalled();
  });

  it("rejects a cookie password below the SDK's minimum length", async () => {
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", "x".repeat(31));
    await expect(new AuthService().requireUser()).rejects.toMatchObject({
      status: 503,
    });
    expect(withAuth).not.toHaveBeenCalled();
  });

  it("returns 401 rather than a redirect for an anonymous API request", async () => {
    await expect(new AuthService().requireUser()).rejects.toMatchObject({
      status: 401,
      message: "Sign in to continue.",
    });
  });

  it("exposes only public identity fields, never session tokens", async () => {
    vi.mocked(withAuth).mockResolvedValue({
      user: {
        id: "user-a",
        email: "a@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        profilePictureUrl: "https://workoscdn.com/ada.jpg",
      },
      accessToken: "not-for-the-browser",
      refreshToken: "also-private",
    } as unknown as Awaited<ReturnType<typeof withAuth>>);
    const service = new AuthService();
    expect(await service.getSession()).toEqual({
      configured: true,
      user: {
        id: "user-a",
        email: "a@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        profilePictureUrl: "https://workoscdn.com/ada.jpg",
      },
    });
    expect(await service.requireUser()).toEqual({
      id: "user-a",
      email: "a@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      profilePictureUrl: "https://workoscdn.com/ada.jpg",
    });
  });
});
