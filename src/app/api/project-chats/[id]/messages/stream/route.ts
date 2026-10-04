import { handleApiStream } from "@/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApiStream(({ projectChatController }, release) =>
    projectChatController.stream(request, id, release),
  );
}
