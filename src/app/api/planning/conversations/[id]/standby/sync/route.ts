import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(({ planningSessionController }) =>
    planningSessionController.syncStandby(request, id),
  );
}
