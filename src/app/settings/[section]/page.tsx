import { notFound } from "next/navigation";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import type { SettingsSection } from "@/features/account/components/account-settings";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!["profile", "security", "preferences", "team"].includes(section))
    notFound();
  return <Dashboard settingsSection={section as SettingsSection} />;
}
