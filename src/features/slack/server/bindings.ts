import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db";
import { resolveSlackBinding } from "./config";
import { slackChannels, slackUsers, slackWorkspaces } from "./schema";

export async function resolveBinding(
  db: Database,
  teamId: string,
  channelId: string,
  slackUserId: string,
) {
  const [row] = await db
    .select({
      organizationId: slackWorkspaces.organizationId,
      projectId: slackChannels.projectId,
      userId: slackUsers.userId,
    })
    .from(slackWorkspaces)
    .innerJoin(slackChannels, eq(slackChannels.teamId, slackWorkspaces.teamId))
    .innerJoin(slackUsers, eq(slackUsers.teamId, slackWorkspaces.teamId))
    .where(
      and(
        eq(slackWorkspaces.teamId, teamId),
        eq(slackChannels.channelId, channelId),
        eq(slackUsers.slackUserId, slackUserId),
      ),
    );
  if (row)
    return {
      actor: { userId: row.userId, organizationId: row.organizationId },
      binding: { projectId: row.projectId },
    };
  // Environment bindings remain available only for workspaces not managed through onboarding.
  const [managed] = await db
    .select()
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.teamId, teamId));
  if (managed) return null;
  return resolveSlackBinding(teamId, channelId, slackUserId);
}
