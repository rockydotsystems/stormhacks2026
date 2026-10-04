import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  return handleApi(({ planningSessionController }) =>
    planningSessionController.list(),
  );
}

export async function POST(request: Request) {
  return handleApi(({ planningSessionController }) =>
    planningSessionController.create(request),
  );
}
