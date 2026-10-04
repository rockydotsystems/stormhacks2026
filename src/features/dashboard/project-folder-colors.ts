import type { CSSProperties } from "react";

type FolderStyle = CSSProperties & {
  "--folder-back": string;
  "--folder-front": string;
  "--folder-edge": string;
};

export function projectFolderColors(projectId: string): FolderStyle {
  let hash = 2166136261;
  for (const character of projectId) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  }
  const hue = hash % 360;

  return {
    "--folder-back": `hsl(${hue} 38% 88%)`,
    "--folder-front": `hsl(${hue} 45% 94%)`,
    "--folder-edge": `hsl(${hue} 28% 78%)`,
  };
}
