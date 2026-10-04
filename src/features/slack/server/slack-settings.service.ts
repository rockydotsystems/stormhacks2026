import { and, eq } from "drizzle-orm";
import type { OrganizationActor } from "@/features/organizations/contracts";
import { requireOrganizationMember } from "@/features/organizations/server/membership";
import { requireProject } from "@/features/projects/server/access";
import { getWorkOS } from "@stormhacks/data/organizations/workos";
import type { Database } from "@/server/db";
import { ApiError } from "@/server/errors";
import { SlackClient, shareableChannel } from "./slack.client";
import { slackChannels, slackUsers, slackWorkspaces } from "./schema";

export class SlackSettingsService {
  constructor(
    private readonly dependencies: { db: Database },
    private readonly client = new SlackClient(),
  ) {}

  private async member(actor: OrganizationActor, admin = false) {
    const membership = await requireOrganizationMember(
      this.dependencies.db,
      actor,
    );
    const canManage =
      membership.role.slug === "admin" ||
      membership.roles?.some((role) => role.slug === "admin") ||
      false;
    if (admin && !canManage)
      throw new ApiError(403, "An organization admin must configure Slack.");
    return canManage;
  }

  private async workspace(actor: OrganizationActor) {
    const [workspace] = await this.dependencies.db
      .select()
      .from(slackWorkspaces)
      .where(eq(slackWorkspaces.organizationId, actor.organizationId));
    if (!workspace)
      throw new ApiError(409, "Connect and verify a Slack workspace first.");
    return workspace;
  }

  async status(actor: OrganizationActor) {
    const canManage = await this.member(actor);
    const [workspace] = await this.dependencies.db
      .select()
      .from(slackWorkspaces)
      .where(eq(slackWorkspaces.organizationId, actor.organizationId));
    if (!workspace)
      return {
        canManage,
        workspace: null,
        bindings: [],
        channels: [],
        linkedUser: null,
      };
    const { token, team_id } = await this.client.sharedConnection(actor);
    if (team_id !== workspace.teamId)
      throw new ApiError(
        409,
        "The connected Slack workspace changed. An admin must verify it again.",
      );
    const [bindings, linked] = await Promise.all([
      this.dependencies.db
        .select()
        .from(slackChannels)
        .where(eq(slackChannels.teamId, workspace.teamId)),
      this.dependencies.db
        .select()
        .from(slackUsers)
        .where(
          and(
            eq(slackUsers.teamId, workspace.teamId),
            eq(slackUsers.userId, actor.userId),
          ),
        ),
    ]);
    return {
      canManage,
      workspace,
      bindings,
      channels: canManage ? await this.client.channels(token) : [],
      linkedUser: linked[0]?.slackUserId || null,
    };
  }

  async connect(actor: OrganizationActor) {
    await this.member(actor, true);
    return this.client.authorize(actor);
  }

  async verify(actor: OrganizationActor) {
    await this.member(actor, true);
    const connection = await this.client.sharedConnection(actor);
    await this.dependencies.db.transaction(async (tx) => {
      // A workspace cannot be claimed by a different application organization.
      const [existing] = await tx
        .select()
        .from(slackWorkspaces)
        .where(eq(slackWorkspaces.teamId, connection.team_id));
      if (existing && existing.organizationId !== actor.organizationId)
        throw new ApiError(
          409,
          "This Slack workspace is already linked to another organization.",
        );
      const [current] = await tx
        .select()
        .from(slackWorkspaces)
        .where(eq(slackWorkspaces.organizationId, actor.organizationId));
      if (current && current.teamId !== connection.team_id)
        throw new ApiError(
          409,
          "Disconnect the existing workspace before connecting another one.",
        );
      const [saved] = await tx
        .insert(slackWorkspaces)
        .values({
          teamId: connection.team_id,
          organizationId: actor.organizationId,
          name: connection.team || connection.team_id,
        })
        .onConflictDoUpdate({
          target: slackWorkspaces.teamId,
          set: { name: connection.team || connection.team_id },
          setWhere: eq(slackWorkspaces.organizationId, actor.organizationId),
        })
        .returning();
      if (!saved)
        throw new ApiError(
          409,
          "This Slack workspace is already linked to another organization.",
        );
    });
  }

  async linkUser(actor: OrganizationActor, slackUserId: string) {
    await this.member(actor);
    const workspace = await this.workspace(actor);
    const connection = await this.client.sharedConnection(actor);
    if (connection.team_id !== workspace.teamId)
      throw new ApiError(409, "Verify the workspace again.");
    const [slackUser, user] = await Promise.all([
      this.client.user(connection.token, slackUserId),
      getWorkOS().userManagement.getUser(actor.userId),
    ]);
    if (
      slackUser.id !== slackUserId ||
      slackUser.team_id !== workspace.teamId ||
      slackUser.deleted ||
      slackUser.is_bot ||
      !user.emailVerified ||
      !slackUser.profile.email ||
      slackUser.profile.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new ApiError(
        403,
        "Use a Slack account with the same verified email as your application account.",
      );
    }
    await this.dependencies.db.transaction(async (tx) => {
      const [claimed] = await tx
        .select()
        .from(slackUsers)
        .where(
          and(
            eq(slackUsers.teamId, workspace.teamId),
            eq(slackUsers.slackUserId, slackUserId),
          ),
        );
      if (claimed && claimed.userId !== actor.userId)
        throw new ApiError(409, "This Slack user is already linked.");
      await tx
        .delete(slackUsers)
        .where(
          and(
            eq(slackUsers.teamId, workspace.teamId),
            eq(slackUsers.userId, actor.userId),
          ),
        );
      await tx.insert(slackUsers).values({
        teamId: workspace.teamId,
        slackUserId,
        userId: actor.userId,
      });
    });
  }

  async bind(actor: OrganizationActor, channelId: string, projectId: string) {
    await this.member(actor, true);
    await requireProject(this.dependencies.db, actor, projectId);
    const workspace = await this.workspace(actor);
    const connection = await this.client.sharedConnection(actor);
    if (connection.team_id !== workspace.teamId)
      throw new ApiError(409, "Verify the workspace again.");
    const channel = await this.client.channel(connection.token, channelId);
    if (channel.id !== channelId || !shareableChannel(channel))
      throw new ApiError(
        400,
        "Invite the bot to an unshared channel before connecting it.",
      );
    await this.dependencies.db
      .insert(slackChannels)
      .values({
        teamId: workspace.teamId,
        channelId,
        projectId,
        name: channel.name,
      })
      .onConflictDoUpdate({
        target: [slackChannels.teamId, slackChannels.channelId],
        set: { projectId, name: channel.name },
      });
  }

  async unbind(actor: OrganizationActor, channelId: string) {
    await this.member(actor, true);
    const workspace = await this.workspace(actor);
    await this.dependencies.db
      .delete(slackChannels)
      .where(
        and(
          eq(slackChannels.teamId, workspace.teamId),
          eq(slackChannels.channelId, channelId),
        ),
      );
  }

  async disconnect(actor: OrganizationActor) {
    await this.member(actor, true);
    // Disable routing immediately; credentials remain in Pipes for reconnecting.
    await this.dependencies.db
      .delete(slackWorkspaces)
      .where(eq(slackWorkspaces.organizationId, actor.organizationId));
  }
}
