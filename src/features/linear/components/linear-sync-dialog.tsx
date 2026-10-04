"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  FileTextIcon,
  KanbanIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  useDocumentLinear,
  useLinearSync,
  useLinearTeams,
} from "../client/queries";
import type {
  DocumentLinearData,
  LinearSyncItem,
  LinearSyncResult,
} from "../contracts";

type Phase = "none" | "running" | "failed" | "current" | "outdated";

function phaseOf(data: DocumentLinearData, running: boolean): Phase {
  if (running) return "running";
  const last = data.lastSync;
  if (!last) return "none";
  if (last.status === "failed") return "failed";
  if (last.status === "running") return "running";
  return last.versionLabel === data.published?.versionLabel
    ? "current"
    : "outdated";
}

const phaseBadge: Record<
  Phase,
  {
    label: string;
    variant: "secondary" | "info" | "error" | "success" | "warning";
  }
> = {
  none: { label: "Not synced", variant: "secondary" },
  running: { label: "Syncing", variant: "info" },
  failed: { label: "Failed", variant: "error" },
  current: { label: "Up to date", variant: "success" },
  outdated: { label: "Newer version available", variant: "warning" },
};

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Endpoint({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {children}
        </div>
      </div>
    </div>
  );
}

function TicketRow({ item }: { item: LinearSyncItem }) {
  const synced = item.state === "synced";
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-sm",
        item.parentKey &&
          "relative pl-9 before:absolute before:left-[1.375rem] before:top-0 before:h-1/2 before:w-3 before:rounded-bl-md before:border-b before:border-l before:border-border",
      )}
    >
      {synced ? (
        <CheckCircleIcon
          weight="fill"
          className="size-4 shrink-0 text-success"
          aria-label="Synced"
        />
      ) : (
        <CircleDashedIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-label="Missing in Linear"
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !synced && "text-muted-foreground",
          !item.parentKey && "font-medium",
        )}
        title={item.title}
      >
        {item.title}
      </span>
      {synced && item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.identifier}
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
      ) : (
        <Badge variant="outline" size="sm">
          Missing
        </Badge>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function LinearSyncDialog({
  open,
  onOpenChange,
  userId,
  organizationId,
  docId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  organizationId: string;
  docId: string;
  title: string;
}) {
  const status = useDocumentLinear(userId, organizationId, docId, open);
  const sync = useLinearSync(userId, organizationId, docId);
  const data = status.data;
  const needsTeam = Boolean(data?.connected && data.published && !data.team);
  const teams = useLinearTeams(organizationId, open && needsTeam);
  const [teamId, setTeamId] = useState<string | null>(null);
  const result: LinearSyncResult | undefined = sync.data;

  const blocked = !data
    ? null
    : !data.connected
      ? {
          title: "Linear is not connected",
          body: data.isAdmin
            ? "Connect Linear for this organization to sync documents."
            : "Ask an organization admin to connect Linear in Settings.",
          settings: data.isAdmin,
        }
      : !data.published
        ? {
            title: "Publish this document first",
            body: "Only published versions can be synced to Linear.",
            settings: false,
          }
        : null;

  const phase = data ? phaseOf(data, sync.isPending) : "none";
  const last = data?.lastSync;
  const items = last?.items ?? [];
  const synced = items.filter((item) => item.state === "synced").length;
  const total = last?.total ?? items.length;
  const canSync =
    Boolean(data?.connected && data.published) &&
    (!needsTeam || Boolean(teamId)) &&
    !sync.isPending;
  const cta =
    phase === "failed"
      ? "Retry missing tickets"
      : phase === "current"
        ? "Sync again"
        : phase === "outdated" && data?.published
          ? `Sync ${data.published.versionLabel}`
          : "Sync to Linear";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="pr-0">Sync to Linear</DialogTitle>
            {data && !blocked && (
              <Badge variant={phaseBadge[phase].variant}>
                {phase === "running" && (
                  <Spinner aria-hidden="true" className="size-3" />
                )}
                {phaseBadge[phase].label}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Turn this published document into a Linear project with issues and
            sub-issues.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="grid gap-5">
          {status.isPending && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner aria-hidden="true" className="size-4" /> Checking Linear…
            </p>
          )}
          {status.error && (
            <Alert variant="error">
              <WarningCircleIcon aria-hidden="true" />
              <AlertTitle>Could not load Linear status</AlertTitle>
              <AlertDescription>{status.error.message}</AlertDescription>
            </Alert>
          )}

          {blocked && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <KanbanIcon aria-hidden="true" className="size-5" />
              </span>
              <p className="font-medium">{blocked.title}</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                {blocked.body}
              </p>
              {blocked.settings && (
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={`/settings/linear?organizationId=${organizationId}`}
                    />
                  }
                >
                  Open Linear settings
                </Button>
              )}
            </div>
          )}

          {data && !blocked && (
            <>
              <Section title="Sync">
                <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3 sm:flex-row sm:items-center">
                  <Endpoint
                    icon={<FileTextIcon className="size-4.5" />}
                    label="Document"
                  >
                    <span className="truncate" title={title}>
                      {title}
                    </span>
                    {data.published && (
                      <Badge variant="outline" size="sm">
                        {data.published.versionLabel}
                      </Badge>
                    )}
                  </Endpoint>
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="hidden size-4 shrink-0 text-muted-foreground sm:block"
                  />
                  <Endpoint
                    icon={<KanbanIcon className="size-4.5" />}
                    label="Linear project"
                  >
                    {data.team ? (
                      <>
                        <span className="truncate">{data.team.name}</span>
                        <Badge variant="outline" size="sm">
                          {data.team.key}
                        </Badge>
                        {data.projectUrl && (
                          <a
                            href={data.projectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open the Linear project"
                            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ArrowSquareOutIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Choose a team
                      </span>
                    )}
                  </Endpoint>
                </div>
              </Section>

              {needsTeam && (
                <Section title="Team">
                  <Label htmlFor={`linear-team-${docId}`} className="sr-only">
                    Linear team
                  </Label>
                  <Select
                    value={teamId}
                    items={(teams.data ?? []).map((team) => ({
                      value: team.id,
                      label: `${team.name} (${team.key})`,
                    }))}
                    onValueChange={setTeamId}
                  >
                    <SelectTrigger id={`linear-team-${docId}`}>
                      <SelectValue placeholder="Choose the team for this project" />
                    </SelectTrigger>
                    <SelectPopup>
                      {(teams.data ?? []).map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name} ({team.key})
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Remembered for every document in this project.
                  </p>
                  {teams.isPending && (
                    <p role="status" className="text-xs text-muted-foreground">
                      Loading teams…
                    </p>
                  )}
                  {teams.error && (
                    <p
                      role="alert"
                      className="text-xs text-destructive-foreground"
                    >
                      {teams.error.message}
                    </p>
                  )}
                </Section>
              )}

              {phase === "running" && (
                <Alert variant="info">
                  <Spinner aria-hidden="true" />
                  <AlertTitle>Creating tickets…</AlertTitle>
                  <AlertDescription>
                    Reading the document and syncing it to Linear. Keep this
                    open until it finishes.
                  </AlertDescription>
                </Alert>
              )}

              {phase === "failed" && last && (
                <Alert variant="error">
                  <WarningCircleIcon aria-hidden="true" />
                  <AlertTitle>
                    Stopped at {last.completed}
                    {last.total !== null ? ` of ${last.total}` : ""} tickets
                  </AlertTitle>
                  <AlertDescription>
                    {last.error} Progress is saved. Retrying only creates the
                    missing tickets.
                  </AlertDescription>
                </Alert>
              )}

              {sync.error && (
                <Alert variant="error">
                  <WarningCircleIcon aria-hidden="true" />
                  <AlertTitle>Sync could not start</AlertTitle>
                  <AlertDescription>{sync.error.message}</AlertDescription>
                </Alert>
              )}

              {result?.sync.status === "completed" && phase !== "running" && (
                <Section title={`Result for ${result.sync.versionLabel}`}>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Created" value={result.created} />
                    <Stat label="Updated" value={result.updated} />
                    <Stat label="Unchanged" value={result.skipped} />
                  </div>
                </Section>
              )}

              {items.length > 0 && (
                <Section
                  title="Tickets"
                  aside={
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {synced} of {total} synced
                    </span>
                  }
                >
                  {phase !== "current" && total > 0 && (
                    <Progress
                      value={synced}
                      max={total}
                      aria-label="Tickets synced"
                    >
                      <ProgressTrack>
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                  )}
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border bg-background">
                    {items.map((item) => (
                      <TicketRow key={item.key} item={item} />
                    ))}
                  </ul>
                </Section>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                Tickets in review or completed are never changed, and tickets
                for removed requirements are left as they are.
              </p>
            </>
          )}
        </DialogPanel>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Close
          </DialogClose>
          {!blocked && (
            <Button
              type="button"
              disabled={!canSync}
              loading={sync.isPending}
              onClick={() => sync.mutate(teamId ? { teamId } : {})}
            >
              {cta}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
