import { handleApi } from "@/server/http";

export const POST = (request: Request) =>
  handleApi(({ githubController }) => githubController.webhook(request));
