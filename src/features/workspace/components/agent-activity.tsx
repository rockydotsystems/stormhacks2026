"use client";

import {
  CheckCircleIcon,
  CircleIcon,
  FileTextIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";

export function AgentActivity({
  running = false,
  stopped = false,
}: {
  running?: boolean;
  stopped?: boolean;
}) {
  return (
    <details className="group mb-6 rounded-xl border bg-muted/25 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 text-muted-foreground [&::-webkit-details-marker]:hidden">
        {running ? (
          <Spinner className="size-3.5 text-primary" />
        ) : (
          <SparkleIcon className="size-3.5 text-primary" aria-hidden="true" />
        )}
        <span>
          {running
            ? "Preparing a sample response"
            : stopped
              ? "Response stopped"
              : "Sample activity"}
        </span>
        <span className="ml-auto text-[10px] group-open:hidden">
          Show steps
        </span>
      </summary>
      <ol className="space-y-3 border-t px-4 py-4 text-muted-foreground">
        <li className="flex items-center gap-2.5">
          <CheckCircleIcon className="size-4 text-primary" aria-hidden="true" />
          Read the conversation
        </li>
        <li className="flex items-center gap-2.5">
          <FileTextIcon className="size-4" aria-hidden="true" />
          Find a relevant sample document
        </li>
        <li className="flex items-center gap-2.5">
          <CircleIcon className="size-4" aria-hidden="true" />
          {running
            ? "Prepare the preview reply"
            : stopped
              ? "Canceled before replying"
              : "Present the project brief"}
        </li>
      </ol>
      <p className="px-4 pb-4 text-[10px] text-muted-foreground">
        Demo activity · not model reasoning or live tool calls
      </p>
    </details>
  );
}
