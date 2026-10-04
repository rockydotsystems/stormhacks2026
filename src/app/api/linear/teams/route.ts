import { handleApi } from "@/server/http";

export const GET = (request: Request) =>
  handleApi(({ linearController }) => linearController.teams(request));
