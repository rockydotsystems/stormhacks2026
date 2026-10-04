export type DocumentBlock = {
  type: "heading" | "paragraph" | "list" | "code";
  text: string;
  level?: number;
  ordered?: boolean;
};

// A small, safe Markdown subset for the existing text snapshots.
export function documentBlocks(content: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let code: string[] | null = null;
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      blocks.push({ type: "paragraph", text: "" });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const list = /^(?:[-*]\s+|\d+\.\s+)(.+)$/.exec(line);
    if (heading)
      blocks.push({
        type: "heading",
        text: heading[2],
        level: heading[1].length,
      });
    else if (list) {
      const ordered = /^\d/.test(line);
      const previous = blocks.at(-1);
      if (previous?.type === "list" && previous.ordered === ordered)
        previous.text += `\n${list[1]}`;
      else blocks.push({ type: "list", text: list[1], ordered });
    } else {
      const previous = blocks.at(-1);
      if (previous?.type === "paragraph" && previous.text)
        previous.text += `\n${line}`;
      else blocks.push({ type: "paragraph", text: line });
    }
  }
  if (code) blocks.push({ type: "code", text: code.join("\n") });
  return blocks.filter((block) => block.text);
}
