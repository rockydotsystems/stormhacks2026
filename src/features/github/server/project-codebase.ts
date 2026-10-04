import "server-only";
import { and, eq } from "drizzle-orm";
import { docs } from "@stormhacks/data/docs/schema";
import { githubRepositoryAccess } from "@stormhacks/data/github/schema";
import {
  githubRepositories,
  projectRepositories,
} from "@/features/projects/server/schema";
import {
  cleanPath,
  formatTree,
  isReadablePath,
  MAX_FILE_BYTES,
  MAX_FILE_CHARS,
  type CodebasePort,
} from "@/features/planning/server/codebase";
import type { Database } from "@/server/db";
import { GitHubClient } from "./github.client";
import { isGitHubConfigured } from "./config";

type Linked = { owner: string; name: string; installationId: string };

type Remote = Pick<
  GitHubClient,
  | "installationToken"
  | "defaultBranch"
  | "repositoryTree"
  | "repositoryFile"
  | "searchCode"
>;

// Reads the repositories linked to the project a document lives in, on each one's default
// branch, through the GitHub App installation. It lists only repositories the project links and
// the installation can still reach, so the agent cannot name any other repository.
export class ProjectCodebase {
  // The second argument is for tests. Awilix passes only the cradle, so it stays unset there.
  constructor(
    private readonly dependencies: { db: Database },
    private readonly github?: Remote,
  ) {}

  // Null when the document's project links no readable repository, or GitHub is not set up.
  async forDocument(
    organizationId: string,
    documentId: string,
  ): Promise<CodebasePort | null> {
    if (!this.github && !isGitHubConfigured()) return null;
    const rows: Linked[] = await this.dependencies.db
      .select({
        owner: githubRepositories.owner,
        name: githubRepositories.name,
        installationId: githubRepositoryAccess.installationId,
      })
      .from(docs)
      .innerJoin(
        projectRepositories,
        and(
          eq(projectRepositories.organizationId, docs.organizationId),
          eq(projectRepositories.projectId, docs.projectId),
        ),
      )
      .innerJoin(
        githubRepositories,
        eq(githubRepositories.id, projectRepositories.repositoryId),
      )
      .innerJoin(
        githubRepositoryAccess,
        eq(githubRepositoryAccess.repositoryId, githubRepositories.id),
      )
      .where(
        and(
          eq(docs.organizationId, organizationId),
          eq(docs.id, documentId),
          eq(githubRepositoryAccess.available, true),
          eq(githubRepositoryAccess.authorized, true),
        ),
      );
    if (rows.length === 0) return null;
    return new GitHubCodebase(rows, this.github ?? new GitHubClient());
  }
}

export class GitHubCodebase implements CodebasePort {
  private readonly tokens = new Map<string, Promise<string>>();
  private readonly branches = new Map<string, Promise<string>>();
  private readonly trees = new Map<
    string,
    ReturnType<Remote["repositoryTree"]>
  >();

  constructor(
    private readonly linked: Linked[],
    private readonly github: Remote,
  ) {}

  repositories() {
    return this.linked.map((repo) => `${repo.owner}/${repo.name}`);
  }

  private find(repository: string): Linked {
    const found = this.linked.find(
      (repo) =>
        `${repo.owner}/${repo.name}`.toLowerCase() === repository.toLowerCase(),
    );
    if (!found) {
      throw new Error(
        `"${repository}" is not linked to this project. Linked: ${this.repositories().join(", ")}.`,
      );
    }
    return found;
  }

  private token(repo: Linked) {
    let token = this.tokens.get(repo.installationId);
    if (!token) {
      token = this.github.installationToken(repo.installationId);
      this.tokens.set(repo.installationId, token);
    }
    return token;
  }

  private branch(repo: Linked) {
    const key = `${repo.owner}/${repo.name}`;
    let branch = this.branches.get(key);
    if (!branch) {
      branch = this.token(repo).then((token) =>
        this.github.defaultBranch(token, repo.owner, repo.name),
      );
      this.branches.set(key, branch);
    }
    return branch;
  }

  private listing(repo: Linked) {
    const key = `${repo.owner}/${repo.name}`;
    let tree = this.trees.get(key);
    if (!tree) {
      tree = Promise.all([this.token(repo), this.branch(repo)]).then(
        ([token, branch]) =>
          this.github.repositoryTree(token, repo.owner, repo.name, branch),
      );
      this.trees.set(key, tree);
    }
    return tree;
  }

  async tree(repository: string, path?: string) {
    const listing = await this.listing(this.find(repository));
    return formatTree(listing.tree, cleanPath(path), listing.truncated);
  }

  async readFile(repository: string, path: string) {
    const repo = this.find(repository);
    const file = cleanPath(path);
    if (!file || !isReadablePath(file)) {
      throw new Error("That file is not readable.");
    }
    const [token, branch] = await Promise.all([
      this.token(repo),
      this.branch(repo),
    ]);
    const data = await this.github.repositoryFile(
      token,
      repo.owner,
      repo.name,
      file,
      branch,
    );
    if (data.type !== "file" || data.content === undefined) {
      throw new Error(
        "That path is not a file. Use the tree tool for folders.",
      );
    }
    if ((data.size ?? 0) > MAX_FILE_BYTES || data.encoding !== "base64") {
      throw new Error("That file is too large to read.");
    }
    const bytes = Buffer.from(data.content, "base64");
    if (bytes.includes(0)) throw new Error("That file is not text.");
    const text = bytes.toString("utf8");
    return text.length > MAX_FILE_CHARS
      ? `${text.slice(0, MAX_FILE_CHARS)}\n(cut at ${MAX_FILE_CHARS} characters)`
      : text;
  }

  async search(repository: string, query: string) {
    const repo = this.find(repository);
    const term = query.trim().slice(0, 120);
    if (!term) throw new Error("The search needs a query.");
    const paths = (
      await this.github.searchCode(
        await this.token(repo),
        repo.owner,
        repo.name,
        term,
      )
    ).filter(isReadablePath);
    return paths.length ? paths.join("\n") : "No matching files.";
  }
}
