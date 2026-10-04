"use client";

import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { useTeam } from "@/features/organizations/client/queries";
import type { TeamData } from "@/features/organizations/contracts";
import { initials } from "@/features/planning/client/live";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "@/components/ui/combobox";

export function DocumentReviewersPicker({
  userId,
  organizationId,
  creatorId,
  reviewers,
  onSelect,
}: {
  userId: string;
  organizationId: string;
  creatorId: string;
  reviewers: TeamData["members"];
  onSelect: (members: TeamData["members"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const team = useTeam(userId, organizationId, open);
  const members = (team.data?.members ?? []).filter(
    (member) => member.userId !== creatorId,
  );

  return (
    <Combobox
      multiple
      autoHighlight
      open={open}
      onOpenChange={setOpen}
      items={members}
      value={reviewers}
      onValueChange={onSelect}
      itemToStringLabel={(member) => `${member.name} ${member.email}`}
      itemToStringValue={(member) => member.userId}
      isItemEqualToValue={(item, value) => item.userId === value.userId}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="document-reviewers-add"
            aria-label="Choose reviewers"
            title="Choose reviewers"
          />
        }
      >
        <PlusIcon aria-hidden="true" />
      </ComboboxTrigger>
      <ComboboxPopup aria-label="Choose reviewers" className="w-72">
        <div className="border-b p-2">
          <ComboboxInput
            showTrigger={false}
            aria-label="Search organization members"
            placeholder="Search by name or email…"
          />
        </div>
        {team.isPending ? (
          <p role="status" className="p-3 text-xs text-muted-foreground">
            Loading members…
          </p>
        ) : team.isError ? (
          <div role="alert" className="p-3 space-y-2">
            <p className="text-xs text-destructive">{team.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => team.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <ComboboxEmpty>No members found.</ComboboxEmpty>
            <ComboboxList>
              {(member: TeamData["members"][number]) => (
                <ComboboxItem key={member.userId} value={member}>
                  <span className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarImage src={member.picture || undefined} alt="" />
                      <AvatarFallback className="text-[10px]">
                        {initials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-col">
                      <span>{member.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </>
        )}
      </ComboboxPopup>
    </Combobox>
  );
}
