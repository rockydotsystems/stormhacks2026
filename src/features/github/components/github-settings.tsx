"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  useGitHubConnection,
  useGitHubSync,
  useGitHubChoices,
} from "../client/queries";

const outcomes: Record<string, string> = {
  connected: "GitHub connected. Repositories are ready to link to projects.",
  choose: "GitHub authorized. Choose the account to share with this workspace.",
  restart:
    "Start the connection here to securely link GitHub to this organization.",
  denied: "GitHub authorization was cancelled. You can try again.",
  access:
    "Install the app on that GitHub account and select repositories you can access, then connect again. Restore the installation if it is suspended.",
  conflict: "That GitHub installation is connected to another organization.",
  failed: "GitHub connection failed or expired. Try connecting again.",
};

export function GitHubSettings({
  userId,
  organizationId,
  outcome,
}: {
  userId: string;
  organizationId: string;
  outcome?: string;
}) {
  const connection = useGitHubConnection(userId, organizationId);
  const sync = useGitHubSync(userId, organizationId);
  const choices = useGitHubChoices(userId, organizationId);
  const [selection, setSelection] = useState<{
    organizationId: string;
    id: string;
  } | null>(null);
  const selectedId =
    selection?.organizationId === organizationId ? selection.id : null;
  const candidates = choices.data?.installations || [];
  const selected = candidates.find(
    (item) => item.id === selectedId && !item.disabledReason,
  );
  if (!organizationId)
    return <p>Create or choose an organization before connecting GitHub.</p>;
  if (connection.isPending)
    return <p role="status">Loading GitHub connections…</p>;
  if (connection.error) return <p role="alert">{connection.error.message}</p>;
  const data = connection.data;
  if (!data) return null;
  return (
    <div className="space-y-6 max-w-2xl">
      <p className="settings-description">
        Optionally share repositories with the selected workspace. Personal
        GitHub accounts and GitHub organizations are both supported. WorkOS
        remains your sign-in provider.
      </p>
      {outcome && Object.hasOwn(outcomes, outcome) && (
        <p
          role={
            outcome === "connected" || outcome === "choose" ? "status" : "alert"
          }
        >
          {outcomes[outcome]}
        </p>
      )}
      {!data.configured ? (
        <p role="status">
          GitHub integration is not configured. Ask an administrator to
          configure the app credentials.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <h2 className="font-medium">1. Install the GitHub App</h2>
            <p className="text-sm text-muted-foreground">
              Install on your GitHub account or organization. Choose only the
              repositories you want to share, then return here.
            </p>
            <Button
              variant="outline"
              render={
                <a
                  href={data.installUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Install GitHub App (opens a new tab)
            </Button>
          </div>
          <form
            action="/api/github/connect"
            method="post"
            className="space-y-3"
          >
            <h2 className="font-medium">2. Authorize GitHub</h2>
            <input type="hidden" name="organizationId" value={organizationId} />
            <p className="text-sm text-muted-foreground">
              GitHub will show the accounts where you installed the app. Only
              repositories your GitHub user can access are imported.
            </p>
            <Button type="submit">
              {choices.data?.authorized
                ? "Authorize GitHub again"
                : "Connect GitHub"}
            </Button>
          </form>
          {choices.isPending && (
            <p role="status">Checking GitHub authorization…</p>
          )}
          {choices.error && <p role="alert">{choices.error.message}</p>}
          {choices.data?.authorized && (
            <form
              action="/api/github/installations"
              method="post"
              className="space-y-3"
            >
              <h2 className="font-medium">3. Choose a GitHub account</h2>
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <input
                type="hidden"
                name="installationId"
                value={selected?.id || ""}
              />
              {candidates.length ? (
                <>
                  <Label htmlFor="github-installation">GitHub account</Label>
                  <Select
                    value={selected?.id || null}
                    items={candidates.map((item) => ({
                      value: item.id,
                      label: item.accountLogin,
                    }))}
                    onValueChange={(id) =>
                      setSelection(id ? { organizationId, id } : null)
                    }
                  >
                    <SelectTrigger id="github-installation">
                      <SelectValue placeholder="Choose a GitHub account" />
                    </SelectTrigger>
                    <SelectPopup>
                      {candidates.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          disabled={Boolean(item.disabledReason)}
                        >
                          {item.accountLogin} ·{" "}
                          {item.accountType === "User"
                            ? "Personal account"
                            : "Organization"}
                          {item.disabledReason
                            ? ` — ${item.disabledReason}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <Button type="submit" disabled={!selected}>
                    Link selected account
                  </Button>
                </>
              ) : (
                <p role="status">
                  No app installations are available. Install the GitHub App on
                  your personal account or organization, then authorize GitHub
                  again.
                </p>
              )}
            </form>
          )}
        </>
      )}
      {sync.error && <p role="alert">{sync.error.message}</p>}
      {sync.isSuccess && <p role="status">Repository access refreshed.</p>}
      {data.installations.map((installation) => (
        <section
          key={installation.id}
          className="rounded-lg border p-4 space-y-3"
        >
          <h2 className="font-medium">{installation.accountLogin}</h2>
          <p className="text-sm text-muted-foreground">
            Connected by {installation.githubUserLogin}.{" "}
            {installation.active
              ? "Active"
              : "Disconnected or suspended — restore and connect again."}
          </p>
          <ul className="space-y-1 text-sm">
            {installation.repositories.map((repository) => (
              <li key={repository.id}>
                <a
                  className="underline underline-offset-4"
                  href={`https://github.com/${repository.owner}/${repository.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {repository.owner}/{repository.name}
                </a>
                {!repository.available && " — access unavailable"}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            disabled={!installation.active || !data.configured}
            loading={sync.isPending}
            onClick={() => sync.mutate(installation.id)}
          >
            Refresh repository access
          </Button>
        </section>
      ))}
      {data.activity.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Recent GitHub activity</h2>
          <ul className="space-y-2 text-sm">
            {data.activity.map((item) => (
              <li key={item.id}>
                {item.repository || "Installation"}:{" "}
                {item.event.replaceAll("_", " ")}
                {item.action ? ` · ${item.action}` : ""}
                <span className="block text-muted-foreground">
                  <time dateTime={item.receivedAt}>
                    {new Date(item.receivedAt).toLocaleString()}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
