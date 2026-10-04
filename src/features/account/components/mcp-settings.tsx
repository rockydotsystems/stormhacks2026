"use client";

import { CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  createMcpSetup,
  mcpAgents,
} from "@/features/account/mcp-configuration";

export function McpSettings({ endpoint }: { endpoint?: string }) {
  const setup = createMcpSetup(endpoint);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function copy(command: string) {
    setNotice("");
    setError("");
    try {
      await navigator.clipboard.writeText(command);
      setNotice("Setup command copied. Run it in your terminal.");
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the command manually.",
      );
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="settings-description">
        To connect WhyDidWeChooseThis to your local coding agent, choose your
        agent and run the following command in your terminal.
      </p>
      {!setup.url ? (
        <p
          role="status"
          className="rounded-lg border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground"
        >
          MCP setup is not available yet. The commands below are previews until
          the app’s MCP endpoint is configured.
        </p>
      ) : setup.url.startsWith("http:") ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          This is a local development endpoint. Start the app’s MCP server with{" "}
          <code>pnpm mcp:dev</code> before connecting your agent.
        </p>
      ) : null}
      <Tabs
        defaultValue="claude"
        onValueChange={() => {
          setNotice("");
          setError("");
        }}
      >
        <h2 className="text-base font-medium">1. Choose your coding agent</h2>
        <TabsList aria-label="Coding agent" className="max-w-full" size="sm">
          {mcpAgents.map((agent) => (
            <TabsTab
              key={agent.id}
              value={agent.id}
              id={`mcp-agent-${agent.id}`}
            >
              {agent.name}
            </TabsTab>
          ))}
        </TabsList>
        {mcpAgents.map((agent) => (
          <TabsPanel
            key={agent.id}
            value={agent.id}
            id={`mcp-panel-${agent.id}`}
            aria-labelledby={`mcp-agent-${agent.id}`}
            className="space-y-6 pt-4"
          >
            <section
              className="space-y-3"
              aria-labelledby={`${agent.id}-setup-heading`}
            >
              <h2
                id={`${agent.id}-setup-heading`}
                className="text-base font-medium"
              >
                2. Run this command
              </h2>
              <p className="settings-description">
                With {agent.name} installed, run this in your terminal. The
                connection is added to your personal configuration for all
                projects on this device.
              </p>
              <pre
                tabIndex={0}
                aria-label={`${agent.name} setup command`}
                className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-6"
              >
                <code>{setup.commands[agent.id]}</code>
              </pre>
              <Button
                variant="outline"
                disabled={!setup.url}
                onClick={() => copy(setup.commands[agent.id])}
              >
                <CopyIcon aria-hidden="true" /> Copy command
              </Button>
            </section>
            <section
              className="space-y-3"
              aria-labelledby={`${agent.id}-signin-heading`}
            >
              <h2
                id={`${agent.id}-signin-heading`}
                className="text-base font-medium"
              >
                3. Sign in
              </h2>
              <p className="settings-description">{agent.signIn}</p>
              <a
                href={agent.docs}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline underline-offset-4"
              >
                Read {agent.name} MCP setup instructions
              </a>
            </section>
          </TabsPanel>
        ))}
      </Tabs>
      {setup.url && (
        <p className="break-all text-xs leading-5 text-muted-foreground">
          Server: {setup.url}
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Sign in with your WorkOS account when prompted. No API key is needed.
        Your agent can read decisions and propose changes, but cannot publish
        permanent versions. Review tool requests before approving them.
      </p>
      <p role="status" className="text-sm text-primary">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
