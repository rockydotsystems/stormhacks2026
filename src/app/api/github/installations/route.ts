import { handleApi } from "@/server/http";

export const GET = (request: Request) =>
  handleApi(({ githubController }) => githubController.installations(request));
export const POST = (request: Request) =>
  handleApi(({ githubController }) => githubController.select(request));
