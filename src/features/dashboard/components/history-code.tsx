"use client";

import { File, MultiFileDiff } from "@pierre/diffs/react";
import { useTheme } from "@/features/account/components/theme-provider";

// The document is markdown, and the file name is how the viewer picks its highlighting.
const NAME = "document.md";

/** The change from `before` to `after`, with the unchanged lines around it. */
export function DiffView({ before, after }: { before: string; after: string }) {
  // The app's own light or dark choice, so the viewer matches it rather than the system setting.
  const { resolvedTheme } = useTheme();
  return (
    <div className="history-code">
      <MultiFileDiff
        oldFile={{ name: NAME, contents: before }}
        newFile={{ name: NAME, contents: after }}
        options={{
          diffStyle: "split",
          disableFileHeader: true,
          expandUnchanged: true,
          overflow: "wrap",
          themeType: resolvedTheme,
        }}
      />
    </div>
  );
}

/** The document text on its own, with line numbers. */
export function RawView({ content }: { content: string }) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="history-code">
      <File
        file={{ name: NAME, contents: content }}
        options={{
          disableFileHeader: true,
          overflow: "wrap",
          themeType: resolvedTheme,
        }}
      />
    </div>
  );
}
