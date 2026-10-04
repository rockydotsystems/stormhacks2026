"use client";

import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/features/account/components/theme-provider";
import {
  useLinearConnect,
  useLinearConnection,
  useLinearDisconnect,
} from "../client/queries";

function LinearPipes() {
  const { resolvedTheme } = useTheme();
  const { getAccessToken } = useAccessToken();
  const queryClient = useQueryClient();
  async function token() {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Sign in to connect Linear.");
    return accessToken;
  }
  return (
    <WorkOsWidgets
      queryClient={queryClient}
      theme={{
        appearance: resolvedTheme,
        accentColor: "teal",
        grayColor: "gray",
        radius: "medium",
        hasBackground: false,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Pipes
        authToken={token}
        filter={{ slugs: ["linear"], authMethods: ["oauth"] }}
      />
    </WorkOsWidgets>
  );
}

export function LinearSettings({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const connection = useLinearConnection(userId, organizationId);
  const connect = useLinearConnect(userId, organizationId);
  const disconnect = useLinearDisconnect(userId, organizationId);
  if (!organizationId)
    return <p>Create or choose an organization before connecting Linear.</p>;
  if (connection.isPending)
    return <p role="status">Loading the Linear connection…</p>;
  if (connection.error) return <p role="alert">{connection.error.message}</p>;
  const data = connection.data;
  return (
    <div className="space-y-6 max-w-2xl">
      <p className="settings-description">
        Turn published documents into Linear projects and issues. A document
        becomes a project, and its decisions and requirements become issues with
        sub-issues. Only organization admins connect Linear. Any editor can sync
        a published document.
      </p>
      {data.connection && (
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">
            {data.connection.linearOrganizationName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Connected{" "}
            <time dateTime={data.connection.connectedAt}>
              {new Date(data.connection.connectedAt).toLocaleString()}
            </time>
            . Issues are created as the admin who connected Linear.
          </p>
          {data.isAdmin ? (
            <Button
              type="button"
              variant="outline"
              loading={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Stop using this connection
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask an organization admin to change this connection.
            </p>
          )}
          {disconnect.error && <p role="alert">{disconnect.error.message}</p>}
        </section>
      )}
      {data.isAdmin ? (
        <section className="space-y-3">
          <h2 className="font-medium">
            {data.connection ? "Change connection" : "1. Connect your Linear"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect your Linear account below. Issues are created as the account
            you connect, so use a dedicated account if you want a neutral
            creator.
          </p>
          <LinearPipes />
          <h2 className="font-medium">
            {data.connection
              ? "Use it for this organization"
              : "2. Use it for this organization"}
          </h2>
          <Button
            type="button"
            loading={connect.isPending}
            onClick={() => connect.mutate()}
          >
            Use my Linear connection
          </Button>
          {connect.isSuccess && (
            <p role="status">
              Linear is ready. Editors can now sync documents.
            </p>
          )}
          {connect.error && <p role="alert">{connect.error.message}</p>}
        </section>
      ) : (
        !data.connection && (
          <p role="status">
            Linear is not connected. Ask an organization admin to connect it.
          </p>
        )
      )}
    </div>
  );
}
