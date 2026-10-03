import { handleApi } from "@/server/http";

export async function GET() {
  return handleApi(({ authController }) => authController.session());
}
