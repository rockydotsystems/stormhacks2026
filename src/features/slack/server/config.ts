import { z } from "zod";

const bindingSchema = z.object({
  teamId: z.string().regex(/^T[A-Z0-9]+$/),
  channelId: z.string().regex(/^[CG][A-Z0-9]+$/),
  organizationId: z.string().startsWith("org_"),
  projectId: z.string().uuid(),
  users: z.record(
    z.string().regex(/^U[A-Z0-9]+$/),
    z.string().startsWith("user_"),
  ),
});
export type SlackBinding = z.infer<typeof bindingSchema>;

export function slackBindings(value = process.env.SLACK_BINDINGS) {
  const bindings = z
    .array(bindingSchema)
    .max(50)
    .parse(JSON.parse(value || "[]"));
  const keys = bindings.map((b) => `${b.teamId}:${b.channelId}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate Slack channel binding.");
  return bindings;
}

export function resolveSlackBinding(
  teamId: string,
  channelId: string,
  user: string,
) {
  const binding = slackBindings().find(
    (b) => b.teamId === teamId && b.channelId === channelId,
  );
  const userId = binding?.users[user];
  if (!binding || !userId) return null;
  return { binding, actor: { organizationId: binding.organizationId, userId } };
}
