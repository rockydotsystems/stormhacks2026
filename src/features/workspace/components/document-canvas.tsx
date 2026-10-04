import { documentBlocks } from "../document-blocks";

export function DocumentCanvas({ content }: { content: string }) {
  const blocks = documentBlocks(content);
  return (
    <div className="document-canvas">
      {blocks.map((block, index) => {
        if (block.type === "heading")
          return block.level === 3 ? (
            <h3 key={index}>{block.text}</h3>
          ) : (
            <h2 key={index}>{block.text}</h2>
          );
        if (block.type === "code")
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.type === "list") {
          const items = block.text
            .split("\n")
            .map((text, item) => <li key={item}>{text}</li>);
          return block.ordered ? (
            <ol key={index}>{items}</ol>
          ) : (
            <ul key={index}>{items}</ul>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}
