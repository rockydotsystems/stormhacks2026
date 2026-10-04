import { handleApi } from "@/server/http";

export const GET = (request: Request) =>
  handleApi(({ teamController }) => teamController.list(request));
export const POST = (request: Request) =>
  handleApi(({ teamController }) => teamController.act(request));
