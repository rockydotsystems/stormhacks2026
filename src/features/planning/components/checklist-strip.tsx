"use client";

import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHalfIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import {
  checklistProgress,
  checklistRows,
  type ChecklistRow,
} from "@/features/planning/client/state";
import type { ChecklistEntry } from "@/features/planning/contracts";

const STATUS_TEXT: Record<ChecklistRow["status"], string> = {
  covered: "covered",
  partial: "partly covered",
  missing: "not covered yet",
};

function StatusIcon({ status }: { status: ChecklistRow["status"] }) {
  if (status === "covered") {
    return <CheckCircleIcon aria-hidden="true" weight="fill" />;
  }
  if (status === "partial") {
    return <CircleHalfIcon aria-hidden="true" weight="fill" />;
  }
  return <CircleDashedIcon aria-hidden="true" />;
}

/**
 * How many recommended topics the interview has covered. The info icon lists what is still open.
 * Children sit on the right of the same line, for the actions that belong with the progress.
 */
export function ChecklistStrip({
  checklist,
  children,
}: {
  checklist: ChecklistEntry[];
  children?: ReactNode;
}) {
  const rows = checklistRows(checklist);
  const { covered, total } = checklistProgress(rows);
  const open = rows.filter((row) => row.status !== "covered");
  return (
    <section
      aria-label="Planning progress"
      className="mb-2 flex items-center gap-2 px-1"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="What is still missing"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <InfoIcon aria-hidden="true" className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup>
          {open.length === 0 ? (
            "Every recommended topic is covered."
          ) : (
            <span className="grid gap-1">
              <span className="font-medium">Still open</span>
              {open.map((row) => (
                <span key={row.id} className="flex items-center gap-1.5">
                  <StatusIcon status={row.status} />
                  {row.label}
                  <span className="sr-only">: {STATUS_TEXT[row.status]}</span>
                </span>
              ))}
            </span>
          )}
        </TooltipPopup>
      </Tooltip>
      <p className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
        {covered}/{total} recommended topics covered
      </p>
      <Progress
        value={Math.round((covered / total) * 100)}
        aria-label="Recommended topics covered"
        className="w-16 max-w-24 min-w-8 flex-1"
      />
      {children ? <div className="ml-auto shrink-0">{children}</div> : null}
    </section>
  );
}
