import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/server/errors";

const API = "https://api.linear.app";

/** Linear rate limits and transient faults. A sync that hits one is saved and retried. */
export class LinearRetryableError extends ApiError {}

/** Linear accepts a client-chosen UUID. Deriving it makes a retried create idempotent. */
export function deterministicId(seed: string) {
  const hex = createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = "89ab"[Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const issueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.object({ name: z.string(), type: z.string() }),
});
export type LinearIssue = z.infer<typeof issueSchema>;

/** Completed or canceled work, and anything in review, is never rewritten. */
export function isLockedIssue(issue: Pick<LinearIssue, "state">) {
  return (
    ["completed", "canceled"].includes(issue.state.type) ||
    /review/i.test(issue.state.name)
  );
}

const issueFields = "id identifier url title description state { name type }";

export class LinearClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async post(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(20000),
        redirect: "manual",
      });
    } catch {
      throw new LinearRetryableError(
        502,
        "Linear could not be reached. Retry the sync.",
      );
    }
    return response;
  }

  async graphql<T>(
    token: string,
    query: string,
    variables: object,
    schema: z.ZodType<T>,
  ) {
    const response = await this.post(`${API}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json().catch(() => null)) as {
      data?: unknown;
      errors?: {
        message?: string;
        extensions?: { code?: string; type?: string };
      }[];
    } | null;
    if (
      response.status === 401 ||
      body?.errors?.some(
        (error) => error.extensions?.code === "AUTHENTICATION_ERROR",
      )
    )
      throw new ApiError(
        409,
        "Linear rejected the connection. An admin must reconnect Linear.",
      );
    const limited =
      response.status === 429 ||
      body?.errors?.some((error) =>
        /ratelimit/i.test(`${error.extensions?.code}${error.extensions?.type}`),
      );
    if (limited)
      throw new LinearRetryableError(
        429,
        "Linear rate limit reached. Retry the sync shortly.",
      );
    if (response.status >= 500)
      throw new LinearRetryableError(
        502,
        "Linear is unavailable. Retry the sync.",
      );
    if (!response.ok || body?.errors?.length)
      throw new ApiError(
        502,
        `Linear rejected the request: ${body?.errors?.[0]?.message ?? response.status}`,
      );
    const parsed = schema.safeParse(body?.data);
    if (!parsed.success)
      throw new ApiError(502, "Linear returned an unexpected response.");
    return parsed.data;
  }

  workspace(token: string) {
    return this.graphql(
      token,
      "query { organization { id name urlKey } }",
      {},
      z.object({
        organization: z.object({
          id: z.string(),
          name: z.string(),
          urlKey: z.string(),
        }),
      }),
    ).then((data) => data.organization);
  }

  teams(token: string) {
    return this.graphql(
      token,
      "query { teams(first: 100) { nodes { id name key } } }",
      {},
      z.object({
        teams: z.object({
          nodes: z.array(
            z.object({ id: z.string(), name: z.string(), key: z.string() }),
          ),
        }),
      }),
    ).then((data) => data.teams.nodes);
  }

  async project(token: string, id: string) {
    const data = await this.graphql(
      token,
      "query($id: ID!) { projects(filter: { id: { eq: $id } }, first: 1) { nodes { id url } } }",
      { id },
      z.object({
        projects: z.object({
          nodes: z.array(z.object({ id: z.string(), url: z.string() })),
        }),
      }),
    );
    return data.projects.nodes[0] ?? null;
  }

  async createProject(
    token: string,
    input: { id: string; name: string; description: string; teamId: string },
  ) {
    const data = await this.graphql(
      token,
      "mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { success project { id url } } }",
      {
        input: {
          id: input.id,
          name: input.name,
          description: input.description,
          teamIds: [input.teamId],
        },
      },
      z.object({
        projectCreate: z.object({
          success: z.boolean(),
          project: z.object({ id: z.string(), url: z.string() }),
        }),
      }),
    );
    return data.projectCreate.project;
  }

  async updateProject(
    token: string,
    id: string,
    input: { name: string; description: string },
  ) {
    await this.graphql(
      token,
      "mutation($id: String!, $input: ProjectUpdateInput!) { projectUpdate(id: $id, input: $input) { success } }",
      { id, input },
      z.object({ projectUpdate: z.object({ success: z.boolean() }) }),
    );
  }

  async issue(token: string, id: string) {
    const data = await this.graphql(
      token,
      `query($id: ID!) { issues(filter: { id: { eq: $id } }, first: 1) { nodes { ${issueFields} } } }`,
      { id },
      z.object({ issues: z.object({ nodes: z.array(issueSchema) }) }),
    );
    return data.issues.nodes[0] ?? null;
  }

  async createIssue(
    token: string,
    input: {
      id: string;
      teamId: string;
      projectId: string;
      parentId?: string;
      title: string;
      description: string;
    },
  ) {
    const data = await this.graphql(
      token,
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${issueFields} } } }`,
      { input },
      z.object({
        issueCreate: z.object({ success: z.boolean(), issue: issueSchema }),
      }),
    );
    return data.issueCreate.issue;
  }

  async updateIssue(
    token: string,
    id: string,
    input: { title: string; description: string },
  ) {
    const data = await this.graphql(
      token,
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${issueFields} } } }`,
      { id, input },
      z.object({
        issueUpdate: z.object({ success: z.boolean(), issue: issueSchema }),
      }),
    );
    return data.issueUpdate.issue;
  }
}
