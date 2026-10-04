import { handleApi } from "@/server/http";
export async function GET(request: Request) {
  return handleApi(({ dashboardController }) =>
    dashboardController.list(request),
  );
}
export async function POST(request: Request) {
  return handleApi(({ dashboardController }) =>
    dashboardController.create(request),
  );
}
