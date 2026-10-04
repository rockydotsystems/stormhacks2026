"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGitHubConnection, useGitHubSync } from "../client/queries";

const outcomes: Record<string, string> = {
  connected: "GitHub connected. Repositories are ready to link to projects.",
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
        Connect GitHub repositories to the organization selected in the sidebar.
        WorkOS remains your sign-in provider.
      </p>
      {outcome && Object.hasOwn(outcomes, outcome) && (
        <p role={outcome === "connected" ? "status" : "alert"}>
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
            <h2 className="font-medium">2. Connect the GitHub account</h2>
            <input type="hidden" name="organizationId" value={organizationId} />
            <Label htmlFor="github-account">
              GitHub username or organization
            </Label>
            <Input
              id="github-account"
              name="accountLogin"
              type="text"
              placeholder="rockydotsystems"
              required
              maxLength={39}
              pattern="[a-zA-Z0-9][a-zA-Z0-9\-]*"
              autoComplete="off"
              aria-describedby="github-account-hint"
            />
            <p
              id="github-account-hint"
              className="text-sm text-muted-foreground"
            >
              Use the account where you installed the app. Only repositories
              your GitHub user can access are imported. Connect again to
              authorize newly added repositories.
            </p>
            <Button type="submit">Connect GitHub account</Button>
          </form>
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
