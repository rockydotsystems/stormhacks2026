export type DiffLine = {
  kind: "added" | "removed" | "unchanged";
  text: string;
};

// Beyond this many cells the table would be too slow to build in the browser. The diff then
// falls back to removing every old line and adding every new one, which is still correct.
const MAX_CELLS = 4_000_000;

function lines(text: string): string[] {
  return text === "" ? [] : text.replace(/\r\n/g, "\n").split("\n");
}

/** A line diff from `before` to `after`. Order follows the new text, removals before additions. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail += 1;
  const oldMid = a.slice(head, a.length - tail);
  const newMid = b.slice(head, b.length - tail);

  const result: DiffLine[] = a
    .slice(0, head)
    .map((text) => ({ kind: "unchanged", text }));
  result.push(...middle(oldMid, newMid));
  result.push(
    ...a.slice(a.length - tail).map((text): DiffLine => ({
      kind: "unchanged",
      text,
    })),
  );
  return result;
}

function middle(a: string[], b: string[]): DiffLine[] {
  if (a.length === 0)
    return b.map((text): DiffLine => ({ kind: "added", text }));
  if (b.length === 0)
    return a.map((text): DiffLine => ({ kind: "removed", text }));
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: "removed", text })),
      ...b.map((text): DiffLine => ({ kind: "added", text })),
    ];
  }
  // lcs[i][j]: the longest common run of a[i..] and b[j..].
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "unchanged", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) out.push({ kind: "removed", text: a[i] });
  for (; j < b.length; j += 1) out.push({ kind: "added", text: b[j] });
  return out;
}

export function diffStats(diff: DiffLine[]) {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.kind === "added") added += 1;
    else if (line.kind === "removed") removed += 1;
  }
  return { added, removed };
}
