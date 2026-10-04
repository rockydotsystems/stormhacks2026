import { handleApi } from "@/server/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleApi(({ projectChatController }) =>
    projectChatController.ask(request, id),
  );
}
