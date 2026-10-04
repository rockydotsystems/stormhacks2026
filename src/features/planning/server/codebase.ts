// The codebase port. The planning agent reads the repositories linked to a project through this
// and nothing else. It is read-only and never names a provider. Repository names are
// "owner/name". Every method returns plain text the model can read, and throws on bad input.

export interface CodebasePort {
  /** The repositories the agent may read, as "owner/name". */
  repositories(): string[];
  /** Files and folders under a path (the root when empty), on the default branch. */
  tree(repository: string, path?: string): Promise<string>;
  /** One text file, cut to a size the model can read. */
  readFile(repository: string, path: string): Promise<string>;
  /** Paths of files whose content matches the query. */
  search(repository: string, query: string): Promise<string>;
}

// Never sent to the model, whatever the repository holds.
const BLOCKED_PATH =
  /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|key|p12|pfx|keystore|jks)|.*secrets?.*\.(json|ya?ml|toml)|credentials(\..*)?)$/i;
const LOCKFILE =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum)$/;
const BINARY_EXTENSION =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|mp[34]|mov|wasm|bin|exe|so|dylib)$/i;

export const MAX_FILE_BYTES = 100_000;
export const MAX_FILE_CHARS = 24_000;
export const MAX_TREE_ENTRIES = 300;

export function isReadablePath(path: string): boolean {
  return (
    !BLOCKED_PATH.test(path) &&
    !LOCKFILE.test(path) &&
    !BINARY_EXTENSION.test(path) &&
    !path.split("/").includes("node_modules")
  );
}

/** A path inside a repository: no leading slash, no "..", no empty parts. */
export function cleanPath(path: string | undefined): string {
  const parts = (path ?? "").split("/").filter((part) => part !== "");
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("The path must stay inside the repository.");
  }
  return parts.join("/");
}

export function formatTree(
  entries: { path: string; type: string; size?: number }[],
  directory: string,
  truncatedByGitHub: boolean,
): string {
  const prefix = directory ? `${directory}/` : "";
  // One level only. Folders appear once, so the model walks down on demand.
  const level = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length);
    if (!rest) continue;
    const [first, ...tail] = rest.split("/");
    if (tail.length > 0) level.set(first, `${first}/`);
    else if (entry.type === "blob" && isReadablePath(entry.path))
      level.set(first, first);
    else if (entry.type === "tree") level.set(first, `${first}/`);
  }
  if (level.size === 0) {
    throw new Error(`Nothing found at "${directory || "/"}".`);
  }
  const names = [...level.values()].sort();
  const shown = names.slice(0, MAX_TREE_ENTRIES);
  const lines = shown.map((name) => `${prefix}${name}`);
  if (names.length > shown.length)
    lines.push(`(${names.length - shown.length} more not shown)`);
  if (truncatedByGitHub)
    lines.push("(GitHub cut this repository's listing short)");
  return lines.join("\n");
}
