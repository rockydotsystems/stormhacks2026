import { notFound } from "next/navigation";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import type { SettingsSection } from "@/features/account/components/account-settings";
import { parseMcpEndpoint } from "@/features/account/mcp-configuration";

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
    !["profile", "security", "preferences", "team", "github", "mcp"].includes(
      section,
    )
  )
    notFound();
  const query = await searchParams;
  let mcpEndpoint: string | undefined;
  if (section === "mcp" && process.env.MCP_RESOURCE_URL) {
    try {
      mcpEndpoint = parseMcpEndpoint(process.env.MCP_RESOURCE_URL);
    } catch {
      // Invalid deployment configuration must not expose credentials to the client.
    }
  }
  return (
    <Dashboard
      settingsSection={section as SettingsSection}
      mcpEndpoint={mcpEndpoint}
      githubOutcome={
        typeof query.github === "string" ? query.github : undefined
      }
    />
  );
}
