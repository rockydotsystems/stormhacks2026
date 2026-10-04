"use client";

import { CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMcpConfiguration } from "@/features/account/mcp-configuration";

export function McpSettings() {
  const [endpoint, setEndpoint] = useState("");
  const [notice, setNotice] = useState("");
  const [copyError, setCopyError] = useState("");
  let configuration: ReturnType<typeof createMcpConfiguration> | undefined;
  let error = "";
  if (endpoint.trim()) {
    try {
      configuration = createMcpConfiguration(endpoint);
    } catch {
      error =
        "Enter an HTTPS server URL without credentials, query parameters, or a fragment. For local development, HTTP on localhost is allowed.";
    }
  }

  async function copy(value: string, label: string) {
    setNotice("");
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setCopyError(
        "Clipboard access is unavailable. Select and copy the text manually.",
      );
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="settings-description">
        Connect an AI client to WhyDidWeChooseThis with Model Context Protocol
        (MCP) to read project decisions and propose document changes.
      </p>
      <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
        A hosted MCP endpoint is not available yet. For local development, start
        the separate MCP server with <code>pnpm mcp:dev</code> and use{" "}
        <code>http://localhost:3001/mcp</code>. Hosted clients cannot reach your
        localhost.
      </p>
      <section aria-labelledby="mcp-endpoint-heading" className="space-y-3">
        <h2 id="mcp-endpoint-heading" className="text-base font-medium">
          Server endpoint
        </h2>
        <Label htmlFor="mcp-endpoint">Server URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="mcp-endpoint"
            type="url"
            placeholder="http://localhost:3001/mcp"
            value={endpoint}
            onChange={(event) => {
              setEndpoint(event.target.value);
              setNotice("");
              setCopyError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? "mcp-endpoint-error" : "mcp-endpoint-hint"
            }
          />
          <Button
            variant="outline"
            disabled={!configuration}
            onClick={() =>
              configuration && copy(configuration.url, "Server URL")
            }
          >
            <CopyIcon aria-hidden="true" /> Copy URL
          </Button>
        </div>
        <p
          id="mcp-endpoint-hint"
          className="text-xs leading-5 text-muted-foreground"
        >
          Use the exact registered MCP endpoint, including /mcp. This field only
          generates configuration; it does not save or connect to the server.
        </p>
        {error && (
          <p
            id="mcp-endpoint-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </section>
      <section aria-labelledby="mcp-client-heading" className="space-y-3">
        <h2 id="mcp-client-heading" className="text-base font-medium">
          VS Code configuration
        </h2>
        <p className="settings-description">
          Run <strong>MCP: Open User Configuration</strong> in the Command
          Palette and merge this server into your existing <code>servers</code>{" "}
          object.
        </p>
        {configuration ? (
          <>
            <pre
              className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-6"
              tabIndex={0}
              aria-label="VS Code MCP configuration"
            >
              <code>{configuration.json}</code>
            </pre>
            <Button
              variant="outline"
              onClick={() => copy(configuration.json, "Configuration")}
            >
              <CopyIcon aria-hidden="true" /> Copy configuration
            </Button>
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Enter a valid server URL to generate your configuration.
          </p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          For other clients, add the server URL as a remote Streamable HTTP
          connection. Your client must support MCP browser OAuth sign-in.
        </p>
      </section>
      <section aria-labelledby="mcp-auth-heading" className="space-y-3">
        <h2 id="mcp-auth-heading" className="text-base font-medium">
          Sign in from your client
        </h2>
        <p className="settings-description">
          Start the connection in your AI client and complete the WorkOS browser
          sign-in and consent flow. Signing in to this web app does not
          authorize the client. Never paste passwords, API keys, or access
          tokens into the configuration.
        </p>
        <p className="settings-description">
          The client can read project documents, propose changes, and delete
          unpublished changes within your authorized organization. It cannot
          publish permanent versions. Review tool requests before approving
          them.
        </p>
      </section>
      <p role="status" className="text-sm text-primary">
        {notice}
      </p>
      {copyError && (
        <p role="alert" className="text-sm text-destructive">
          {copyError}
        </p>
      )}
    </div>
  );
}
