import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "@/features/auth/server/auth.service";
import Home from "./page";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

vi.mock("@/features/dashboard/components/dashboard", () => ({
  Dashboard: () => null,
}));
vi.mock("@/features/landing/components/landing-page", () => ({
  LandingPage: () => null,
}));

import { Dashboard } from "@/features/dashboard/components/dashboard";
import { LandingPage } from "@/features/landing/components/landing-page";

afterEach(() => vi.restoreAllMocks());

describe("home route", () => {
  it.each([false, true])(
    "shows the public landing page without a user (auth configured: %s)",
    async (configured) => {
      vi.spyOn(AuthService.prototype, "getSession").mockResolvedValue({
        configured,
        user: null,
      });
      expect((await Home()).type).toBe(LandingPage);
    },
  );

  it("preserves the signed-in dashboard at the existing home URL", async () => {
    vi.spyOn(AuthService.prototype, "getSession").mockResolvedValue({
      configured: true,
      user: {
        id: "user-a",
        email: "a@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        profilePictureUrl: null,
      },
    });
    expect((await Home()).type).toBe(Dashboard);
  });
});
