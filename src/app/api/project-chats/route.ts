import { handleApi } from "@/server/http";

export const GET = (request: Request) =>
  handleApi(({ projectChatController }) => projectChatController.list(request));
export const POST = (request: Request) =>
  handleApi(({ projectChatController }) =>
    projectChatController.create(request),
  );
