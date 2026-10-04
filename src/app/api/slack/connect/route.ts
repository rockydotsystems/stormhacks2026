import { handleApi } from "@/server/http";
import { SlackSettingsController } from "@/features/slack/server/slack-settings.controller";

export const POST = (request: Request) =>
  handleApi((dependencies) =>
    new SlackSettingsController(dependencies).connect(request),
  );
