import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import { z } from "zod";
import { getGitHubConfig } from "./config";
import { ApiError } from "@/server/errors";
import { readLimitedBody } from "./security";
import {
  reviewFileSchema,
  reviewPullRequestSchema,
} from "@stormhacks/data/github-review/contracts";

async function readProviderJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(
      (await readLimitedBody(response, 4 * 1024 * 1024)).toString("utf8"),
    );
  } catch {
    throw new ApiError(502, "GitHub returned an unexpected response.");
  }
}

const id = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .transform(String);
export const remoteRepositorySchema = z.object({
  id,
  name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
});
const installationSchema = z.object({
  id,
  app_id: id,
  account: z.object({
    login: z.string().min(1),
    type: z.enum(["User", "Organization"]),
  }),
  suspended_at: z.string().nullable(),
});
export type RemoteRepository = z.infer<typeof remoteRepositorySchema>;
export type RemoteInstallation = z.infer<typeof installationSchema>;

export class GitHubClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async request<T>(
    path: string,
    token: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ) {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, {
        ...init,
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "stormhacks2026",
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new ApiError(502, "GitHub could not be reached. Try again.");
    }
    if (!response.ok)
      throw new ApiError(
        response.status === 401 ||
          response.status === 403 ||
          response.status === 404
          ? 403
          : 502,
        "GitHub access could not be verified. Check the app installation and try connecting again.",
      );
    const result = schema.safeParse(await readProviderJson(response));
    if (!result.success)
      throw new ApiError(502, "GitHub returned an unexpected response.");
    return result.data;
  }

  private async pages<T>(
    path: string,
    token: string,
    key: string,
    schema: z.ZodType<T>,
  ) {
    const result: T[] = [];
    for (let page = 1; page <= 5; page++) {
      const data = await this.request(
        `${path}?per_page=100&page=${page}`,
        token,
        z.object({ total_count: z.number().int().nonnegative() }).passthrough(),
      );
      if (data.total_count > 500)
        throw new ApiError(
          422,
          "Connect an installation with at most 500 repositories.",
        );
      const parsed = z.array(schema).safeParse(data[key]);
      if (!parsed.success)
        throw new ApiError(502, "GitHub returned an unexpected response.");
      const rows = parsed.data;
      result.push(...rows);
      if (result.length >= data.total_count || rows.length < 100) return result;
    }
    throw new ApiError(
      422,
      "This installation is too large to connect in one request.",
    );
  }

  async exchangeCode(code: string, verifier: string, redirectUri: string) {
    const config = getGitHubConfig();
    let response: Response;
    try {
      response = await this.fetcher(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
          }),
        },
      );
    } catch {
      console.error("GitHub OAuth exchange failed", { reason: "network" });
      throw new ApiError(
        502,
        "GitHub could not be reached. Try connecting again.",
      );
    }
    let value: unknown;
    try {
      value = await readProviderJson(response);
    } catch (error) {
      console.error("GitHub OAuth exchange failed", {
        reason: "invalid_response",
        status: response.status,
      });
      throw error;
    }
    const data = z.object({ access_token: z.string().min(1) }).safeParse(value);
    if (!response.ok || !data.success) {
      const providerError = z
        .object({
          error: z.enum([
            "bad_verification_code",
            "incorrect_client_credentials",
            "redirect_uri_mismatch",
            "access_denied",
            "unsupported_grant_type",
          ]),
        })
        .safeParse(value);
      console.error("GitHub OAuth exchange failed", {
        reason: providerError.success
          ? providerError.data.error
          : "provider_rejected",
        status: response.status,
      });
      throw new ApiError(
        400,
        "GitHub authorization failed. Try connecting again.",
      );
    }
    return data.data.access_token;
  }

  user(token: string) {
    return this.request(
      "/user",
      token,
      z.object({ id, login: z.string().min(1) }),
    );
  }
  installations(token: string) {
    return this.pages(
      "/user/installations",
      token,
      "installations",
      installationSchema,
    );
  }
  userRepositories(token: string, installationId: string) {
    return this.pages(
      `/user/installations/${installationId}/repositories`,
      token,
      "repositories",
      remoteRepositorySchema,
    );
  }

  async installationToken(installationId: string, reviewRepositoryId?: number) {
    const config = getGitHubConfig();
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: config.clientId, iat: now - 60, exp: now + 540 })}`;
    const jwt = `${payload}.${Buffer.from(sign("RSA-SHA256", Buffer.from(payload), createPrivateKey(config.privateKey))).toString("base64url")}`;
    const data = await this.request(
      `/app/installations/${installationId}/access_tokens`,
      jwt,
      z.object({ token: z.string().min(1) }),
      {
        method: "POST",
        body: JSON.stringify({
          ...(reviewRepositoryId
            ? { repository_ids: [reviewRepositoryId] }
            : {}),
          permissions: reviewRepositoryId
            ? {
                metadata: "read",
                contents: "read",
                pull_requests: "write",
              }
            : {
                metadata: "read",
                contents: "read",
                issues: "read",
                pull_requests: "read",
              },
        }),
      },
    );
    return data.token;
  }

  installationRepositories(token: string) {
    return this.pages(
      "/installation/repositories",
      token,
      "repositories",
      remoteRepositorySchema,
    );
  }

  pullRequest(token: string, owner: string, repo: string, number: number) {
    return this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
      token,
      reviewPullRequestSchema.extend({
        changed_files: z.number().int().nonnegative(),
      }),
    );
  }

  async pullRequestFiles(
    token: string,
    owner: string,
    repo: string,
    number: number,
    expected: number,
  ) {
    if (expected > 200)
      throw new ApiError(422, "Review supports at most 200 changed files.");
    const files = [];
    for (let page = 1; page <= Math.max(1, Math.ceil(expected / 100)); page++) {
      files.push(
        ...(await this.request(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files?per_page=100&page=${page}`,
          token,
          z.array(reviewFileSchema),
        )),
      );
    }
    if (files.length !== expected)
      throw new ApiError(
        502,
        "Pull request file coverage changed while reading.",
      );
    return files;
  }

  async findReview(
    token: string,
    owner: string,
    repo: string,
    number: number,
    marker: string,
  ) {
    for (let page = 1; page <= 10; page++) {
      const reviews = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/reviews?per_page=100&page=${page}`,
        token,
        z.array(
          z.object({
            id,
            body: z.string().nullable(),
            user: z.object({ type: z.string(), login: z.string() }),
          }),
        ),
      );
      const found = reviews.find(
        (review) =>
          review.user.type === "Bot" &&
          review.user.login === `${getGitHubConfig().slug}[bot]` &&
          review.body?.includes(marker),
      );
      if (found) return found.id;
      if (reviews.length < 100) return null;
    }
    throw new ApiError(
      422,
      "Review history is too large to deduplicate safely.",
    );
  }

  createPullRequestComment(
    token: string,
    owner: string,
    repo: string,
    number: number,
    body: string,
  ) {
    return this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`,
      token,
      z.object({ id }),
      { method: "POST", body: JSON.stringify({ body }) },
    );
  }

  createReview(
    token: string,
    owner: string,
    repo: string,
    number: number,
    review: {
      commit_id: string;
      body: string;
      comments: {
        path: string;
        line: number;
        side: "LEFT" | "RIGHT";
        body: string;
      }[];
    },
  ) {
    return this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/reviews`,
      token,
      z.object({ id }),
      { method: "POST", body: JSON.stringify({ ...review, event: "COMMENT" }) },
    );
  }
}
