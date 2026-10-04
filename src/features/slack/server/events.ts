import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/server/errors";
import { readLimitedBody } from "@/features/github/server/security";

export const mentionSchema = z.object({
  type: z.literal("event_callback"),
  event_id: z.string().min(1).max(100),
  team_id: z.string().regex(/^T[A-Z0-9]+$/),
  api_app_id: z.string().min(1),
  event: z.object({
    type: z.literal("app_mention"),
    user: z.string().regex(/^U[A-Z0-9]+$/),
    channel: z.string().regex(/^[CG][A-Z0-9]+$/),
    text: z.string().max(8000),
    ts: z.string().regex(/^\d+\.\d+$/),
    thread_ts: z
      .string()
      .regex(/^\d+\.\d+$/)
      .optional(),
    bot_id: z.string().optional(),
    subtype: z.string().optional(),
  }),
});
export type SlackMention = z.infer<typeof mentionSchema>;

export async function readSlackEvent(
  request: Request,
  secret: string,
  now = Date.now(),
) {
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !signature ||
    !/^v0=[a-f0-9]{64}$/.test(signature)
  ) {
    throw new ApiError(401, "Invalid Slack signature.");
  }
  const body = await readLimitedBody(request, 64 * 1024);
  const expected = createHmac("sha256", secret)
    .update(`v0:${timestamp}:`)
    .update(body)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(3), "hex")))
    throw new ApiError(401, "Invalid Slack signature.");
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "Invalid Slack event.");
  }
}

export function mentionQuestion(event: SlackMention) {
  return event.event.text
    .replace(/<@U[A-Z0-9]+>/g, "")
    .trim()
    .replace(/^[,:\s]+/, "")
    .slice(0, 4000);
}
