"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTeam, useTeamAction } from "../client/queries";
import type { TeamAction } from "../contracts";

function ConfirmAction({
  label,
  description,
  disabled,
  act,
}: {
  label: string;
  description: string;
  disabled: boolean;
  act: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError("");
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="destructive-outline" size="sm" disabled={disabled} />
        }
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="px-6 pb-4 text-sm" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="ghost" disabled={disabled} />}
          >
            Cancel
          </AlertDialogClose>
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={async () => {
              try {
                await act();
                setOpen(false);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Unable to update the team. Try again.",
                );
              }
            }}
          >
            {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function TeamSettings({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const team = useTeam(userId, organizationId);
  const mutation = useTeamAction(userId, organizationId);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  if (!organizationId)
    return <p>Create or choose an organization to manage its team.</p>;
  if (team.isPending) return <p role="status">Loading your team…</p>;
  if (team.error)
    return (
      <div role="alert">
        <p>{team.error.message}</p>
        <Button variant="outline" onClick={() => void team.refetch()}>
          Try again
        </Button>
      </div>
    );
  const data = team.data;
  const adminCount = data.members.filter(
    (member) => member.role === "admin",
  ).length;
  async function act(action: TeamAction, message: string) {
    setError("");
    setNotice("");
    await mutation.mutateAsync(action);
    setNotice(message);
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await act({ action: "invite", email }, "Invitation sent.");
      setEmail("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to send the invitation. Try again.",
      );
    }
  }
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3 settings-description">
        <p>
          Everyone can contribute to projects, documents, and decisions, and
          invite teammates. No GitHub account or membership in the linked GitHub
          organization is required.
        </p>
        <p>
          Admins can also promote, demote, or remove members. There are no
          owners, and the workspace must always have at least one admin.
        </p>
        <p>
          Invited teammates can see all shared workspace content, including
          repository context shared through GitHub.
        </p>
      </div>
      <form onSubmit={invite} className="space-y-3">
        <Label htmlFor="team-invite-email">Invite a teammate</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1 min-w-48"
            id="team-invite-email"
            type="email"
            required
            maxLength={254}
            placeholder="teammate@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={mutation.isPending}>
            Send invitation
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          New teammates join as members. An admin can promote them after they
          join.
        </p>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <section aria-labelledby="team-members-heading" className="space-y-3">
        <h2 id="team-members-heading" className="font-semibold">
          Members
        </h2>
        <ul className="divide-y rounded-xl border">
          {data.members.map((member) => {
            const lastAdmin = member.role === "admin" && adminCount === 1;
            const disabled = mutation.isPending || member.directoryManaged;
            const self = member.userId === userId;
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0 break-words">
                  <p className="font-medium">
                    {member.name}
                    {self ? " (you)" : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {member.email} ·{" "}
                    {member.role === "admin" ? "Admin" : "Member"}
                  </p>
                  {lastAdmin && (
                    <p className="text-sm text-muted-foreground">
                      Last admin — promote another member before demoting or
                      removing.
                    </p>
                  )}
                  {member.directoryManaged && (
                    <p className="text-sm text-muted-foreground">
                      Managed by your identity provider.
                    </p>
                  )}
                </div>
                {data.canManageMembers && (
                  <div className="flex flex-wrap gap-2">
                    {member.role === "member" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={async () => {
                          try {
                            await act(
                              {
                                action: "role",
                                membershipId: member.id,
                                role: "admin",
                              },
                              `${member.name} is now an admin.`,
                            );
                          } catch (error) {
                            setError(
                              error instanceof Error
                                ? error.message
                                : "Unable to promote this member. Try again.",
                            );
                          }
                        }}
                      >
                        Promote to admin
                      </Button>
                    ) : (
                      <ConfirmAction
                        label="Demote to member"
                        disabled={disabled || lastAdmin}
                        description={`${member.name} will keep access to all workspace content but can no longer change roles or remove members.${self ? " You will lose your admin access." : ""}`}
                        act={() =>
                          act(
                            {
                              action: "role",
                              membershipId: member.id,
                              role: "member",
                            },
                            `${member.name} is now a member.`,
                          )
                        }
                      />
                    )}
                    <ConfirmAction
                      label="Remove member"
                      disabled={disabled || lastAdmin}
                      description={`Remove ${member.name} from this workspace? They will lose access to its projects, documents, and conversations. Their existing contributions will remain.`}
                      act={async () => {
                        await act(
                          { action: "remove", membershipId: member.id },
                          "Member removed.",
                        );
                        if (self) {
                          // Reload to discard cached data from the revoked workspace.
                          const destination = new URL(
                            "/",
                            window.location.origin,
                          );
                          window.location.assign(destination.href);
                        }
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="team-invitations-heading" className="space-y-3">
        <h2 id="team-invitations-heading" className="font-semibold">
          Pending invitations
        </h2>
        {data.invitations.length ? (
          <ul className="divide-y rounded-xl border">
            {data.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <p className="break-all">{invitation.email}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={async () => {
                      try {
                        await act(
                          { action: "resend", invitationId: invitation.id },
                          "Invitation resent.",
                        );
                      } catch (error) {
                        setError(
                          error instanceof Error
                            ? error.message
                            : "Unable to resend this invitation. Try again.",
                        );
                      }
                    }}
                  >
                    Resend invitation
                  </Button>
                  {data.canManageMembers && (
                    <ConfirmAction
                      label="Revoke invitation"
                      disabled={mutation.isPending}
                      description={`Cancel the pending invitation for ${invitation.email}?`}
                      act={() =>
                        act(
                          { action: "revoke", invitationId: invitation.id },
                          "Invitation revoked.",
                        )
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No pending invitations.
          </p>
        )}
      </section>
    </div>
  );
}
