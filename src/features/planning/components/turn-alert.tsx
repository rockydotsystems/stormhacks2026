"use client";

import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function TurnAlert({
  kind,
  message,
  onRetry,
  onDismiss,
}: {
  kind: "auth" | "config" | "conflict" | "missing" | "other";
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (kind === "auth") {
    return (
      <Alert variant="info" className="mb-3">
        <InfoIcon aria-hidden="true" />
        <AlertDescription>{message}</AlertDescription>
        <AlertAction>
          <Button size="sm" render={<a href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  return (
    <Alert variant="error" className="mb-3">
      <WarningCircleIcon aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  );
}
