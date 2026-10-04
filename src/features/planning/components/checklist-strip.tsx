"use client";

import {
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHalfIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
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

const VARIANT = {
  covered: "success",
  partial: "warning",
  missing: "outline",
} as const;

export function ChecklistStrip({ checklist }: { checklist: ChecklistEntry[] }) {
  const rows = checklistRows(checklist);
  const { covered, total } = checklistProgress(rows);
  return (
    <section aria-label="Planning progress" className="mb-3 px-1">
      <div className="mb-2 flex items-center gap-3">
        <p className="text-[11px] font-medium text-muted-foreground">
          {covered} of {total} topics covered
        </p>
        <Progress
          value={Math.round((covered / total) * 100)}
          aria-label="Topics covered"
          className="max-w-32"
        />
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <li key={row.id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant={VARIANT[row.status]} size="lg" tabIndex={0} />
                }
              >
                <StatusIcon status={row.status} />
                {row.label}
                <span className="sr-only">: {STATUS_TEXT[row.status]}</span>
              </TooltipTrigger>
              <TooltipPopup>
                {row.evidence ??
                  (row.status === "missing"
                    ? "Not discussed yet."
                    : STATUS_TEXT[row.status])}
              </TooltipPopup>
            </Tooltip>
          </li>
        ))}
      </ul>
    </section>
  );
}
