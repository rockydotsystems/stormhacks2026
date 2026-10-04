import type { DocChange, DocVersion } from "@/features/docs/contracts";
import type { DocumentData } from "../contracts";

export type VersionKey = number | "draft";

export type HistoryEntry = {
  key: VersionKey;
  label: string;
  // Null for the draft, which has no version yet.
  version: DocVersion | null;
  // The changes this entry owns: those after the previous version, up to its own change.
  changes: DocChange[];
  // The snapshot shown for this entry. Always the entry's newest change.
  head: DocChange | null;
  // The snapshot this entry is compared with: the previous version's change, if any.
  base: DocChange | null;
};

export type PublishState =
  | { kind: "draft" }
  | { kind: "published"; version: DocVersion }
  | { kind: "edited"; version: DocVersion; unpublished: number };

function after(change: DocChange, id: string | null) {
  return id === null || BigInt(change.id) > BigInt(id);
}

/** Where the document stands: never published, published and current, or edited since. */
export function publishState(data: DocumentData): PublishState {
  const version = data.versions.at(-1);
  if (!version) return { kind: "draft" };
  const unpublished = data.changes.filter((change) =>
    after(change, version.changeId),
  ).length;
  return unpublished === 0
    ? { kind: "published", version }
    : { kind: "edited", version, unpublished };
}

/** Versions newest first, with the unpublished draft on top when there is one. */
export function historyEntries(data: DocumentData): HistoryEntry[] {
  const versions = data.versions.toSorted((a, b) => a.number - b.number);
  const byId = new Map(data.changes.map((change) => [change.id, change]));
  const entries: HistoryEntry[] = versions.map((version, index) => {
    const previous = versions[index - 1] ?? null;
    return {
      key: version.number,
      label: version.label,
      version,
      changes: data.changes.filter(
        (change) =>
          after(change, previous?.changeId ?? null) &&
          BigInt(change.id) <= BigInt(version.changeId),
      ),
      head: byId.get(version.changeId) ?? null,
      base: previous ? (byId.get(previous.changeId) ?? null) : null,
    };
  });
  const latest = versions.at(-1) ?? null;
  const draftChanges = data.changes.filter((change) =>
    after(change, latest?.changeId ?? null),
  );
  if (draftChanges.length > 0) {
    entries.push({
      key: "draft",
      label: "Draft",
      version: null,
      changes: draftChanges,
      head: draftChanges.at(-1) ?? null,
      base: latest ? (byId.get(latest.changeId) ?? null) : null,
    });
  }
  return entries.toReversed();
}

/** The snapshot before this change in the document's own order, or null for the first one. */
export function previousChange(
  data: DocumentData,
  change: DocChange,
): DocChange | null {
  const index = data.changes.findIndex((item) => item.id === change.id);
  return index > 0 ? data.changes[index - 1] : null;
}
