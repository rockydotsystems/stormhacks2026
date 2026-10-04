import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const { signIn, configured } = vi.hoisted(() => ({
  signIn: vi.fn(),
  configured: vi.fn(),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({ getSignInUrl: signIn }));
vi.mock("@/features/auth/server/config", () => ({
  isAuthConfigured: configured,
}));

beforeEach(() => {
  vi.resetAllMocks();
  configured.mockReturnValue(true);
  signIn.mockResolvedValue(
    "https://api.workos.com/user_management/authorize?state=protected&code_challenge=pkce",
  );
});

it("forwards invitation tokens without replacing AuthKit state or PKCE", async () => {
  await expect(
    GET(new Request("https://app.test/invite?invitation_token=invite-token")),
  ).rejects.toMatchObject({
    digest:
      "NEXT_REDIRECT;replace;https://api.workos.com/user_management/authorize?state=protected&code_challenge=pkce&invitation_token=invite-token;307;",
  });
});

it("rejects missing invitation tokens", async () => {
  expect((await GET(new Request("https://app.test/invite"))).status).toBe(400);
  expect(signIn).not.toHaveBeenCalled();
});
