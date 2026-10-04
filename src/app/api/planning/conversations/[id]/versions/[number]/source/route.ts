import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; number: string }> },
) {
  const { id, number } = await params;
  return handleApi(({ planningSessionController }) =>
    planningSessionController.versionSource(id, number),
  );
}
