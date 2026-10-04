import { notFound } from "next/navigation";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import type { SettingsSection } from "@/features/account/components/account-settings";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{
    organizationId?: string | string[];
    github?: string | string[];
  }>;
}) {
  const { section } = await params;
  if (
    !["profile", "security", "preferences", "team", "github"].includes(section)
  )
    notFound();
  const query = await searchParams;
  return (
    <Dashboard
      settingsSection={section as SettingsSection}
      githubOutcome={
        typeof query.github === "string" ? query.github : undefined
      }
    />
  );
}
