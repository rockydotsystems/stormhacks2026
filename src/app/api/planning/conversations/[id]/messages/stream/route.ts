import { handleApiStream } from "@/server/http";

export const runtime = "nodejs";

// Server-Sent Events. handleApiStream keeps the request scope open until the stream ends.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApiStream(({ planningSessionController }, release) =>
    planningSessionController.stream(request, id, release),
  );
}
