import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "./github.client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GitHub API adapter", () => {
  it("logs only allowlisted OAuth diagnostics, never codes or provider details", async () => {
    for (const key of [
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_PRIVATE_KEY",
      "GITHUB_WEBHOOK_SECRET",
    ])
      vi.stubEnv(key, "private-config-value");
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "bad_verification_code",
          error_description: "private-provider-details",
          access_token: "private-token",
        },
        { status: 400 },
      ),
    );
    await expect(
      new GitHubClient(fetcher).exchangeCode(
        "private-code",
        "private-verifier",
        "https://app.test/callback",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(logger).toHaveBeenLastCalledWith("GitHub OAuth exchange failed", {
      reason: "bad_verification_code",
      status: 400,
    });
    fetcher.mockResolvedValue(
      Response.json(
        {
          error: "private-arbitrary-error",
          error_description: "private-provider-details",
        },
        { status: 400 },
      ),
    );
    await expect(
      new GitHubClient(fetcher).exchangeCode(
        "private-code",
        "private-verifier",
        "https://app.test/callback",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(logger).toHaveBeenLastCalledWith("GitHub OAuth exchange failed", {
      reason: "provider_rejected",
      status: 400,
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("private-");
  });
  it("uses bounded pagination and validates provider identities", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          total_count: 101,
          repositories: Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            name: `repo-${i}`,
            owner: { login: "org" },
          })),
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          total_count: 101,
          repositories: [{ id: 101, name: "last", owner: { login: "org" } }],
        }),
      );
    const rows = await new GitHubClient(fetcher).userRepositories(
      "user-token",
      "123",
    );
    expect(rows).toHaveLength(101);
    expect(rows[100].id).toBe("101");
    expect(fetcher.mock.calls[1][0]).toContain("page=2");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: "Bearer user-token" },
    });
  });

  it("maps revoked access to a safe error, without provider response details", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "private details" }, { status: 403 }),
      );
    await expect(
      new GitHubClient(fetcher).user("secret-token"),
    ).rejects.toMatchObject({ status: 403 });
    fetcher.mockResolvedValue(Response.json({ id: "invalid" }));
    await expect(
      new GitHubClient(fetcher).user("secret-token"),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects installations above the synchronous import limit without returning a partial list", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ total_count: 501, repositories: [] }));
    await expect(
      new GitHubClient(fetcher).userRepositories("user-token", "123"),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("signs a short-lived app JWT and requests read-only installation permissions", async () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    for (const key of [
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_WEBHOOK_SECRET",
    ])
      vi.stubEnv(key, "test-config");
    vi.stubEnv(
      "GITHUB_PRIVATE_KEY",
      keys.privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ token: "installation-token" }));
    expect(await new GitHubClient(fetcher).installationToken("123")).toBe(
      "installation-token",
    );
    const init = fetcher.mock.calls[0][1];
    const jwt = init.headers.Authorization.slice(7);
    const [header, payload, signature] = jwt.split(".");
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        keys.publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.exp - claims.iat).toBe(600);
    expect(claims.iss).toBe("test-config");
    expect(JSON.parse(init.body)).toEqual({
      permissions: {
        metadata: "read",
        contents: "read",
        issues: "read",
        pull_requests: "read",
      },
    });
  });

  it("exchanges authorization codes with PKCE and a fixed callback", async () => {
    for (const key of [
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_PRIVATE_KEY",
      "GITHUB_WEBHOOK_SECRET",
    ])
      vi.stubEnv(key, "test-config");
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        access_token: "user-token",
        refresh_token: "not-persisted",
      }),
    );
    expect(
      await new GitHubClient(fetcher).exchangeCode(
        "code",
        "verifier",
        "https://app.test/api/github/callback",
      ),
    ).toBe("user-token");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      code: "code",
      code_verifier: "verifier",
      redirect_uri: "https://app.test/api/github/callback",
    });
  });
});
