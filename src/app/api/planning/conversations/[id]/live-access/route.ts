import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(({ planningSessionController }) =>
    planningSessionController.liveAccess(id),
  );
}
