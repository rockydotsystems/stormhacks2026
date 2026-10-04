import { handleApi } from "@/server/http";

export const GET = (request: Request) =>
  handleApi(({ githubController }) => githubController.callback(request));
