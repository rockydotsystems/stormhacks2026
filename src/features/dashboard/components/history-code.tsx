"use client";

import { File, MultiFileDiff } from "@pierre/diffs/react";

// The document is markdown, and the file name is how the viewer picks its highlighting.
const NAME = "document.md";

// Follows the app's theme switch when it is set, and the system setting otherwise.
function themeType() {
  const theme = document.documentElement.dataset.theme;
  return theme === "dark" || theme === "light" ? theme : "system";
}

/** The change from `before` to `after`, with the unchanged lines around it. */
export function DiffView({ before, after }: { before: string; after: string }) {
  return (
    <MultiFileDiff
      oldFile={{ name: NAME, contents: before }}
      newFile={{ name: NAME, contents: after }}
      options={{
        diffStyle: "unified",
        disableFileHeader: true,
        expandUnchanged: true,
        overflow: "wrap",
        themeType: themeType(),
      }}
    />
  );
}

/** The document text on its own, with line numbers. */
export function RawView({ content }: { content: string }) {
  return (
    <File
      file={{ name: NAME, contents: content }}
      options={{
        disableFileHeader: true,
        overflow: "wrap",
        themeType: themeType(),
      }}
    />
  );
}
