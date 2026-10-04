import { handleApi } from "@/server/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleApi(({ projectChatController }) =>
    projectChatController.get(request, id),
  );
}
