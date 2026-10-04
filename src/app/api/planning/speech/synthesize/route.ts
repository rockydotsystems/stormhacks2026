import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(({ planningController }) =>
    planningController.synthesize(request),
  );
}
