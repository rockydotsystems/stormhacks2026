import { cn } from "@/lib/utils";

export function ProjectAvatar({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  let hash = 2166136261;
  for (const character of projectId) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  }

  const hue = hash % 360;
  const rotation = (hash >>> 8) % 360;
  const offset = 20 + ((hash >>> 16) % 25);

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("project-avatar", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="100" height="100" fill={`hsl(${hue} 45% 82%)`} />
      <g transform={`rotate(${rotation} 50 50)`}>
        <circle cx={offset} cy="25" r="48" fill={`hsl(${hue} 55% 55%)`} />
        <circle
          cx="80"
          cy={100 - offset}
          r="52"
          fill={`hsl(${(hue + 45) % 360} 55% 35%)`}
        />
        <circle
          cx="78"
          cy="18"
          r="18"
          fill={`hsl(${(hue + 25) % 360} 70% 90%)`}
        />
      </g>
    </svg>
  );
}
