"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";

type Settings = {
  canManage: boolean;
  workspace: { teamId: string; name: string } | null;
  channels: { id: string; name: string }[];
  bindings: { channelId: string; name: string; projectId: string }[];
  projects: { id: string; name: string }[];
  linkedUser: string | null;
};

export function SlackSettings({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const key = ["slack-settings", userId, organizationId];
  const settings = useQuery({
    queryKey: key,
    enabled: Boolean(organizationId),
    queryFn: () =>
      apiClient<Settings>(
        `/api/slack/settings?organizationId=${encodeURIComponent(organizationId)}`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (action: Record<string, unknown>) =>
      apiClient("/api/slack/settings", {
        method: "POST",
        body: JSON.stringify({ organizationId, ...action }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const [channelId, setChannelId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [confirmSharing, setConfirmSharing] = useState(false);
  if (!organizationId)
    return <p>Create or choose an organization before connecting Slack.</p>;
  if (settings.isPending) return <p role="status">Loading Slack settings…</p>;
  const data = settings.data;
  return (
    <div className="max-w-2xl space-y-6">
      <p className="settings-description">
        Connect a Slack workspace through WorkOS Pipes. Ask the bot about
        recorded project decisions by mentioning @whydidwechoosethis.
      </p>
      {settings.error && (
        <div role="alert" className="space-y-2">
          <p>{settings.error.message}</p>
          <Button variant="outline" onClick={() => void settings.refetch()}>
            Reload connection
          </Button>
        </div>
      )}
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && <p role="status">Slack settings saved.</p>}
      {(!data || data.canManage) && (
        <section className="space-y-3">
          <h2 className="font-medium">1. Connect a workspace</h2>
          <form action="/api/slack/connect" method="post">
            <input type="hidden" name="organizationId" value={organizationId} />
            <Button type="submit">
              {data?.workspace ? "Reconnect Slack" : "Connect Slack"}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            After authorizing Slack, return here and verify the connection. Each
            organization connects one workspace.
          </p>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ action: "verify" })}
          >
            Verify connected workspace
          </Button>
        </section>
      )}
      {data && !data.workspace && !data.canManage && (
        <p>Ask an organization admin to connect Slack first.</p>
      )}
      {data?.workspace && (
        <>
          <p>
            Connected workspace: <strong>{data.workspace.name}</strong>
          </p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              mutation.mutate({
                action: "linkUser",
                slackUserId: String(form.get("slackUserId")),
              });
            }}
          >
            <h2 className="font-medium">2. Link your Slack identity</h2>
            <p className="text-sm text-muted-foreground">
              In Slack, open your profile and choose Copy member ID. Your Slack
              email must match your verified application email. Each teammate
              links their own identity.
            </p>
            <Label htmlFor="slack-user-id">Slack member ID</Label>
            <Input
              id="slack-user-id"
              name="slackUserId"
              required
              pattern="U[A-Z0-9]+"
              placeholder="U0123456789"
              defaultValue={data.linkedUser || ""}
            />
            <Button type="submit" disabled={mutation.isPending}>
              Link my Slack identity
            </Button>
            {data.linkedUser && (
              <p role="status">Your identity is linked: {data.linkedUser}</p>
            )}
          </form>
          {data.canManage && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({
                  action: "bind",
                  channelId,
                  projectId,
                  confirmSharing,
                });
              }}
            >
              <h2 className="font-medium">3. Connect a channel to a project</h2>
              <p className="text-sm text-muted-foreground">
                Invite the bot to the channel, then reload this page. Shared and
                Slack Connect channels are excluded.
              </p>
              <Label htmlFor="slack-channel">Slack channel</Label>
              <Select
                items={data.channels.map((channel) => ({
                  value: channel.id,
                  label: `#${channel.name}`,
                }))}
                value={channelId}
                onValueChange={setChannelId}
              >
                <SelectTrigger id="slack-channel">
                  <SelectValue placeholder="Choose a channel" />
                </SelectTrigger>
                <SelectPopup>
                  {data.channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      #{channel.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Label htmlFor="slack-project">Project</Label>
              <Select
                items={data.projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                }))}
                value={projectId}
                onValueChange={setProjectId}
              >
                <SelectTrigger id="slack-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectPopup>
                  {data.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmSharing}
                  onChange={(event) => setConfirmSharing(event.target.checked)}
                  required
                />
                I authorize sharing this project’s decisions, drafts, and
                rationale with everyone who can see this Slack channel.
              </Label>
              <Button
                type="submit"
                disabled={
                  !channelId ||
                  !projectId ||
                  !confirmSharing ||
                  mutation.isPending
                }
              >
                Connect channel
              </Button>
            </form>
          )}
          <section className="space-y-3">
            <h2 className="font-medium">Connected channels</h2>
            {!data.bindings.length && <p>No channels connected yet.</p>}
            {data.bindings.map((binding) => (
              <div
                key={binding.channelId}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <p>
                  #{binding.name} →{" "}
                  {data.projects.find((p) => p.id === binding.projectId)
                    ?.name || "Unavailable project"}
                </p>
                {data.canManage && (
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        action: "unbind",
                        channelId: binding.channelId,
                      })
                    }
                  >
                    Disconnect channel
                  </Button>
                )}
              </div>
            ))}
          </section>
          <p className="text-sm text-muted-foreground">
            Test: @whydidwechoosethis, why are we using an mssql database? Allow
            about one minute plus generation time.
          </p>
          {data.canManage && (
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Disable all Slack channel connections and identity mappings for this organization?",
                  )
                )
                  mutation.mutate({ action: "disconnect" });
              }}
            >
              Disable workspace integration
            </Button>
          )}
        </>
      )}
    </div>
  );
}
