"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  LinkIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Connection = { id: string; name: string; url: string };
const providers = [
  {
    name: "Linear",
    description: "Issues, projects, and team context",
    url: "https://mcp.linear.app/mcp",
    monogram: "L",
  },
  {
    name: "Notion",
    description: "Pages, notes, and shared knowledge",
    url: "https://mcp.notion.com/mcp",
    monogram: "N",
  },
];

export function ConnectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<"catalog" | "setup" | "review">("catalog");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [notice, setNotice] = useState("");

  function setup(provider?: (typeof providers)[number]) {
    setName(provider?.name ?? "");
    setUrl(provider?.url ?? "");
    setError("");
    setNotice("");
    setStep("setup");
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    try {
      const endpoint = new URL(url);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password
      )
        throw new Error();
      if (!name.trim()) {
        setError("Enter a name for this connection.");
        return;
      }
      setError("");
      setStep("review");
    } catch {
      setError("Enter an HTTPS server URL without embedded credentials.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setStep("catalog");
          setError("");
        }
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-background text-primary">
            <PlugsConnectedIcon className="size-5" />
          </div>
          <DialogTitle>
            {step === "catalog"
              ? "Connect your tools"
              : step === "setup"
                ? "Set up a connection"
                : "Review access"}
          </DialogTitle>
          <DialogDescription>
            {step === "catalog"
              ? "Bring context into your conversations with MCP."
              : step === "setup"
                ? "Give your MCP server a name and an endpoint."
                : "Check the server before continuing to authorization."}
          </DialogDescription>
        </DialogHeader>
        {step === "catalog" ? (
          <>
            <DialogPanel className="space-y-4">
              <p className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-primary">
                UI preview only. No provider is contacted and no credentials are
                collected. Connections last until you reload.
              </p>
              {notice && (
                <p role="status" className="text-sm text-primary">
                  {notice}
                </p>
              )}
              {connections.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Preview connections
                  </h3>
                  {connections.map((connection) => (
                    <div
                      key={connection.id}
                      className="flex items-center gap-3 rounded-xl border p-3"
                    >
                      <CheckIcon className="size-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{connection.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {connection.url}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${connection.name}`}
                        onClick={() => {
                          setConnections((items) =>
                            items.filter((item) => item.id !== connection.id),
                          );
                          setNotice(
                            `${connection.name} removed from this preview.`,
                          );
                        }}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {providers.map((provider) => (
                  <button
                    type="button"
                    key={provider.name}
                    onClick={() => setup(provider)}
                    className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-lg font-semibold">
                      {provider.monogram}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {provider.name}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {provider.description}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setup()}
              >
                <LinkIcon /> Add a custom MCP server
              </Button>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>
                Done
              </DialogClose>
            </DialogFooter>
          </>
        ) : step === "setup" ? (
          <form className="contents" onSubmit={review}>
            <DialogPanel className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="connection-name">Connection name</Label>
                <Input
                  id="connection-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Design workspace"
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="connection-url">Server URL</Label>
                <Input
                  id="connection-url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setError("");
                  }}
                  type="url"
                  placeholder="https://example.com/mcp"
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? "connection-error" : "connection-hint"
                  }
                />
                <p
                  id="connection-hint"
                  className="text-xs leading-5 text-muted-foreground"
                >
                  Use an HTTPS endpoint. Never paste an API key or access token
                  here.
                </p>
                {error && (
                  <p
                    id="connection-error"
                    role="alert"
                    className="text-sm text-destructive-foreground"
                  >
                    {error}
                  </p>
                )}
              </div>
              <div className="flex gap-2 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
                OAuth credentials should be handled by the provider, not the
                chat.
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("catalog")}>
                Back
              </Button>
              <Button type="submit">
                Review connection <ArrowRightIcon />
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogPanel className="space-y-5">
              <div className="rounded-xl border p-4">
                <p className="text-sm font-medium">{name.trim()}</p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {url}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium">
                  Permissions haven’t been requested
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  In the live flow, the provider will show its actual
                  permissions and ask you to authorize access. This preview only
                  adds a sample connection to the list.
                </p>
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("setup")}>
                Back
              </Button>
              <Button
                onClick={() => {
                  setConnections((items) => [
                    ...items,
                    { id: crypto.randomUUID(), name: name.trim(), url },
                  ]);
                  setNotice(
                    `${name.trim()} added as a preview. No access was authorized.`,
                  );
                  setStep("catalog");
                }}
              >
                Add preview connection
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
