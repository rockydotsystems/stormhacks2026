import app from "vinext/server/fetch-handler";
import { connectLive, liveConversationId } from "./live";
import { processReviewJob } from "./review-jobs";

export * from "vinext/server/fetch-handler";

const handler: ExportedHandler<Cloudflare.Env> = {
  async scheduled() {
    await processReviewJob();
  },
  async fetch(request, env, ctx) {
    const conversationId = liveConversationId(request);
    if (conversationId) {
      return connectLive(request, conversationId, env.CHAT_ROOM, (inner) =>
        app.fetch(inner, env, ctx),
      );
    }
    return app.fetch(request, env, ctx);
  },
};

export default handler;
