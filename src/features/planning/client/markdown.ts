// A small, safe Markdown parser for the planning document. It returns plain data, and the
// renderer turns that data into React text nodes. HTML in the source is never interpreted.
// Supported: headings, paragraphs, bullet and numbered lists (nesting is flattened), fenced
// code, horizontal rules, and bold, italic, inline code and links inside text.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] };

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inline: InlineNode[] }
  | { type: "paragraph"; inline: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "code"; language: string | null; text: string }
  | { type: "rule" };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: InlineNode[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      type: "paragraph",
      inline: parseInline(paragraph.join(" ")),
    });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      flushList();
      const marker = fence[1];
      const body: string[] = [];
      i++;
      // An unclosed fence runs to the end of the document.
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "code",
        language: fence[2] || null,
        text: body.join("\n"),
      });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        inline: parseInline(heading[2]),
      });
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[1]));
      continue;
    }

    // A wrapped list item continues the previous item. Anything else starts a paragraph.
    if (list && /^\s+\S/.test(line)) {
      const last = list.items.length - 1;
      list.items[last] = [
        ...list.items[last],
        ...parseInline(` ${line.trim()}`),
      ];
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

// Order matters: code spans first so their contents stay literal, then links, bold, italic.
const INLINE =
  /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|(?<!\w)__([^_\n]+)__(?!\w)|\*([^*\n]+)\*|(?<!\w)_([^_\n]+)_(?!\w)/g;

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE)) {
    const start = match.index;
    if (start > cursor) {
      nodes.push({ type: "text", text: source.slice(cursor, start) });
    }
    const [, code, label, url, strongA, strongB, emA, emB] = match;
    if (code !== undefined) {
      nodes.push({ type: "code", text: code });
    } else if (label !== undefined) {
      // Links render as plain text with the address visible. Nothing becomes clickable.
      nodes.push({ type: "text", text: `${label} (${url})` });
    } else if (strongA !== undefined || strongB !== undefined) {
      nodes.push({
        type: "strong",
        children: parseInline(strongA ?? strongB ?? ""),
      });
    } else {
      nodes.push({ type: "em", children: parseInline(emA ?? emB ?? "") });
    }
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    nodes.push({ type: "text", text: source.slice(cursor) });
  }
  return nodes;
}

export function documentFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "project-plan"}.md`;
}
