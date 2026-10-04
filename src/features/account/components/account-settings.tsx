"use client";

import { useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import {
  WorkOsWidgets,
  UserProfile,
  UserSecurity,
  UserSessions,
  UsersManagement,
} from "@workos-inc/widgets";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { useSession } from "@/features/auth/client/queries";
import { useDefaultDocumentSort } from "@/features/account/preferences";
import { GitHubSettings } from "@/features/github/components/github-settings";

export type SettingsSection =
  "profile" | "security" | "preferences" | "team" | "github";
const headings = {
  profile: "Profile",
  security: "Security",
  preferences: "Preferences",
  team: "Team settings",
  github: "GitHub",
};

function AuthenticatedWidgets({
  section,
}: {
  section: Exclude<SettingsSection, "preferences" | "github">;
}) {
  const { organizationId, permissions } = useAuth();
  const { getAccessToken } = useAccessToken();
  const queryClient = useQueryClient();
  async function token() {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Sign in to manage your account.");
    return accessToken;
  }
  if (section === "team" && !organizationId)
    return (
      <p className="settings-description">
        Sign in to an organization to manage its team.
      </p>
    );
  if (
    section === "team" &&
    !permissions?.includes("widgets:users-table:manage")
  )
    return (
      <p className="settings-description">
        An organization administrator can manage members and roles.
      </p>
    );
  return (
    <WorkOsWidgets
      queryClient={queryClient}
      theme={{
        accentColor: "teal",
        grayColor: "gray",
        radius: "medium",
        hasBackground: false,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {section === "profile" && <UserProfile authToken={token} />}
      {section === "security" && (
        <>
          <UserSecurity authToken={token} />
          <div className="settings-sessions">
            <h2>Active sessions</h2>
            <UserSessions authToken={token} />
          </div>
        </>
      )}
      {section === "team" && <UsersManagement authToken={token} />}
    </WorkOsWidgets>
  );
}

function Preferences({ userId }: { userId?: string }) {
  const [sort, setSort] = useDefaultDocumentSort(userId);
  const [error, setError] = useState("");
  return (
    <div className="settings-preferences">
      <div>
        <Label htmlFor="default-document-sort">Default document order</Label>
        <p className="settings-description">
          Choose how documents are sorted when you open a list.
        </p>
      </div>
      <Select
        items={[
          { value: "Last updated", label: "Last updated" },
          { value: "Name", label: "Name" },
        ]}
        value={sort}
        onValueChange={(next) => {
          if (!next) return;
          try {
            setSort(next);
            setError("");
          } catch {
            setError("Your browser could not save this preference.");
          }
        }}
      >
        <SelectTrigger id="default-document-sort">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="Last updated">Last updated</SelectItem>
          <SelectItem value="Name">Name</SelectItem>
        </SelectPopup>
      </Select>
      <p className="settings-device-note">Saved on this device.</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export default function AccountSettings({
  section,
  organizationId = "",
  githubOutcome,
}: {
  section: SettingsSection;
  organizationId?: string;
  githubOutcome?: string;
}) {
  const session = useSession();
  return (
    <div className="settings-content">
      <h1>{headings[section]}</h1>
      {section === "preferences" ? (
        <Preferences userId={session.data?.user?.id} />
      ) : session.isPending ? (
        <p role="status">Loading your account…</p>
      ) : session.error ? (
        <p role="alert">{session.error.message}</p>
      ) : session.data?.configured && session.data.user ? (
        section === "github" ? (
          <GitHubSettings
            userId={session.data.user.id}
            organizationId={organizationId}
            outcome={githubOutcome}
          />
        ) : (
          <AuthenticatedWidgets section={section} />
        )
      ) : (
        <div className="settings-sign-in">
          <p className="settings-description">
            Sign in to manage{" "}
            {section === "github"
              ? "GitHub connections"
              : section === "team"
                ? "your team"
                : section === "security"
                  ? "your password, verification methods, and sessions"
                  : "your name, email, and profile"}
            .
          </p>
          <Button render={<Link href="/login" />}>Sign in with WorkOS</Button>
        </div>
      )}
    </div>
  );
}
