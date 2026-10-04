import { afterEach, expect, it, vi } from "vitest";
import { openToken, sealToken } from "./selection-token";

afterEach(() => vi.unstubAllEnvs());
it("encrypts selection credentials and binds them to the session context", () => {
  for (const key of [
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
  ])
    vi.stubEnv(key, "test-secret");
  const encrypted = sealToken("private-user-token", "hash:user:org");
  expect(encrypted).not.toContain("private-user-token");
  expect(openToken(encrypted, "hash:user:org")).toBe("private-user-token");
  expect(() => openToken(encrypted, "hash:other:org")).toThrow("expired");
  const tampered = Buffer.from(encrypted, "base64url");
  tampered[30] ^= 1;
  expect(() =>
    openToken(tampered.toString("base64url"), "hash:user:org"),
  ).toThrow("expired");
});
