import { handleApi } from "@/server/http";

export const POST = (request: Request) =>
  handleApi(({ linearController }) => linearController.disconnect(request));
