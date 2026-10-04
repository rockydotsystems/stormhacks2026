"use client";

import { Fragment } from "react";
import {
  parseMarkdown,
  type InlineNode,
  type MdBlock,
} from "@/features/planning/client/markdown";

// Renders the Markdown document as React text nodes. Model output is never parsed as HTML.
function Inline({ nodes }: { nodes: InlineNode[] }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "code":
        return (
          <code
            key={index}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {node.text}
          </code>
        );
      case "strong":
        return (
          <strong key={index} className="font-semibold text-foreground">
            <Inline nodes={node.children} />
          </strong>
        );
      case "em":
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        );
    }
  });
}

function BlockView({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "heading": {
      const className = "font-semibold tracking-tight break-words";
      if (block.level === 1)
        return (
          <h2 className={`text-3xl leading-tight ${className}`}>
            <Inline nodes={block.inline} />
          </h2>
        );
      if (block.level === 2)
        return (
          <h3 className={`mt-6 text-xl ${className}`}>
            <Inline nodes={block.inline} />
          </h3>
        );
      if (block.level === 3)
        return (
          <h4 className={`mt-3 text-base ${className}`}>
            <Inline nodes={block.inline} />
          </h4>
        );
      return (
        <h5 className={`mt-2 text-sm ${className}`}>
          <Inline nodes={block.inline} />
        </h5>
      );
    }
    case "paragraph":
      return (
        <p className="break-words text-sm leading-7 text-foreground/80">
          <Inline nodes={block.inline} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="break-words">
          <Inline nodes={item} />
        </li>
      ));
      const className =
        "ml-5 space-y-2 text-sm leading-6 text-foreground/80 marker:text-muted-foreground";
      return block.ordered ? (
        <ol className={`list-decimal ${className}`}>{items}</ol>
      ) : (
        <ul className={`list-disc ${className}`}>{items}</ul>
      );
    }
    case "code":
      return (
        <figure className="rounded-lg border bg-muted/50">
          {block.language ? (
            <figcaption className="border-b px-3 py-1 font-mono text-xs text-muted-foreground">
              {block.language}
            </figcaption>
          ) : null}
          <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-xs">
            <code>{block.text}</code>
          </pre>
        </figure>
      );
    case "rule":
      return <hr className="my-2 border-border" />;
  }
}

export function MarkdownView({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
