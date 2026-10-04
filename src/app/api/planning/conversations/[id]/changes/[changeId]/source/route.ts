import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  const { id, changeId } = await params;
  return handleApi(({ planningSessionController }) =>
    planningSessionController.changeSource(id, changeId),
  );
}
