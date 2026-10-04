import { z } from "zod";
import { container } from "../src/server/container";
import { ApiError } from "../src/server/errors";
import {
  mentionSchema,
  readSlackEvent,
} from "../src/features/slack/server/events";
import { SlackService } from "../src/features/slack/server/slack.service";

export async function slackWebhook(request: Request) {
  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return new Response("Slack is not configured", { status: 503 });
  let scope: ReturnType<typeof container.createScope> | undefined;
  try {
    const input = await readSlackEvent(request, secret);
    const challenge = z
      .object({
        type: z.literal("url_verification"),
        challenge: z.string().min(1).max(1000),
      })
      .safeParse(input);
    if (challenge.success)
      return Response.json({ challenge: challenge.data.challenge });
    const mention = mentionSchema.safeParse(input);
    if (mention.success) {
      if (mention.data.api_app_id !== process.env.SLACK_APP_ID)
        throw new ApiError(401, "Wrong Slack app.");
      scope = container.createScope();
      await new SlackService(scope.cradle).enqueue(mention.data);
    }
    return new Response("OK");
  } catch (error) {
    if (error instanceof ApiError)
      return new Response(error.message, { status: error.status });
    console.error("Slack webhook failed");
    return new Response("Unable to accept Slack event", { status: 500 });
  } finally {
    await scope?.dispose();
  }
}

export async function processSlackJob() {
  if (!process.env.SLACK_SIGNING_SECRET) return;
  const scope = container.createScope();
  try {
    await new SlackService(scope.cradle).processNext();
  } finally {
    await scope.dispose();
  }
}
