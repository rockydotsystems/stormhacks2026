import { describe, expect, it } from "vitest";
import {
  cleanPath,
  formatTree,
  isReadablePath,
} from "@/features/planning/server/codebase";
import { GitHubCodebase } from "@/features/github/server/project-codebase";

describe("isReadablePath", () => {
  it.each([
    ".env",
    "apps/api/.env.local",
    "deploy/server.pem",
    "keys/id_rsa",
    "config/secrets.json",
    "pnpm-lock.yaml",
    "logo.png",
    "node_modules/x/index.js",
  ])("blocks %s", (path) => expect(isReadablePath(path)).toBe(false));

  it.each(["src/auth/session.ts", "README.md", ".github/workflows/ci.yml"])(
    "allows %s",
    (path) => expect(isReadablePath(path)).toBe(true),
  );
});

describe("cleanPath", () => {
  it("normalizes slashes and rejects escapes", () => {
    expect(cleanPath("/src//app/")).toBe("src/app");
    expect(cleanPath(undefined)).toBe("");
    expect(() => cleanPath("../etc")).toThrow("inside the repository");
  });
});

describe("formatTree", () => {
  const entries = [
    { path: "src", type: "tree" },
    { path: "src/a.ts", type: "blob" },
    { path: "src/deep/b.ts", type: "blob" },
    { path: "src/.env", type: "blob" },
    { path: "README.md", type: "blob" },
  ];
  it("lists one level and hides unreadable files", () => {
    expect(formatTree(entries, "", false)).toBe("README.md\nsrc/");
    expect(formatTree(entries, "src", false)).toBe("src/a.ts\nsrc/deep/");
  });
  it("fails for a path with nothing in it", () => {
    expect(() => formatTree(entries, "missing", false)).toThrow("Nothing");
  });
});

describe("GitHubCodebase", () => {
  const calls: string[] = [];
  const remote = {
    installationToken: async (id: string) => {
      calls.push(`token ${id}`);
      return "tok";
    },
    defaultBranch: async () => "trunk",
    repositoryTree: async () => ({
      truncated: false,
      tree: [{ path: "src/a.ts", type: "blob" }],
    }),
    repositoryFile: async (
      _token: string,
      _owner: string,
      _name: string,
      path: string,
      branch: string,
    ) => {
      calls.push(`file ${path}@${branch}`);
      const body = path === "bin.dat" ? "a\0b" : "export const a = 1;";
      return {
        type: "file",
        size: body.length,
        encoding: "base64",
        content: Buffer.from(body).toString("base64"),
      };
    },
    searchCode: async () => ["src/a.ts", ".env"],
  };
  const reader = new GitHubCodebase(
    [{ owner: "acme", name: "api", installationId: "9" }],
    remote,
  );

  it("reads a file from the default branch with one token", async () => {
    expect(await reader.readFile("ACME/api", "src/a.ts")).toBe(
      "export const a = 1;",
    );
    await reader.tree("acme/api");
    expect(calls).toContain("file src/a.ts@trunk");
    expect(calls.filter((call) => call.startsWith("token"))).toHaveLength(1);
  });

  it("refuses repositories the project does not link", async () => {
    await expect(reader.readFile("acme/other", "a.ts")).rejects.toThrow(
      "not linked",
    );
  });

  it("refuses secrets, escapes, and binary files", async () => {
    await expect(reader.readFile("acme/api", ".env")).rejects.toThrow(
      "not readable",
    );
    await expect(reader.readFile("acme/api", "../x")).rejects.toThrow(
      "inside the repository",
    );
    await expect(reader.readFile("acme/api", "bin.dat")).rejects.toThrow(
      "not text",
    );
  });

  it("drops unreadable paths from search results", async () => {
    expect(await reader.search("acme/api", "a")).toBe("src/a.ts");
  });
});
