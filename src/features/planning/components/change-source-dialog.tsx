"use client";

import { MicrophoneIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useChangeSource } from "@/features/planning/client/queries";
import { formatWhen } from "@/features/planning/client/state";
import { cn } from "@/lib/utils";

const MODE_TEXT = {
  generated: "Generated from this conversation",
  edited: "Edited by the planning agent",
  reverted: "Reverted to an earlier change",
} as const;

// The conversation segment behind one change: the messages since the previous change, up to the
// reply that announced it. Voice turns show their transcript.
export function ChangeSourceDialog({
  conversationId,
  changeId,
  onClose,
}: {
  conversationId: string;
  changeId: string | null;
  onClose: () => void;
}) {
  const source = useChangeSource(conversationId, changeId);
  const data = source.data;
  return (
    <Dialog
      open={changeId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conversation behind this change</DialogTitle>
          <DialogDescription>
            {data
              ? MODE_TEXT[data.mode]
              : "The messages that led to this change."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {source.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Loading conversation
            </div>
          ) : source.isError ? (
            <div>
              <Alert variant="error">
                <WarningCircleIcon aria-hidden="true" />
                <AlertDescription>
                  This conversation could not be loaded. Close the dialog and
                  try again.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <ol className="flex flex-col gap-4">
              {source.data.messages.map((message) => {
                const isTrigger = message.id === source.data.triggerMessageId;
                const isResult = message.id === source.data.resultMessageId;
                return (
                  <li
                    key={message.id}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-xl border p-3.5",
                      message.role === "user" ? "bg-muted/50" : "bg-card",
                      (isTrigger || isResult) && "border-primary/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {message.role === "user" ? "You" : "Planning agent"}
                      </span>
                      <span>{formatWhen(message.createdAt)}</span>
                      {message.via === "voice" ? (
                        <Badge variant="outline" size="sm">
                          <MicrophoneIcon aria-hidden="true" />
                          Voice transcript
                        </Badge>
                      ) : null}
                      {isTrigger ? (
                        <Badge variant="info" size="sm">
                          Asked for the change
                        </Badge>
                      ) : null}
                      {isResult ? (
                        <Badge variant="success" size="sm">
                          Announced the change
                        </Badge>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {message.content}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
