import { handleApi } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return handleApi(({ dashboardController }) =>
    dashboardController.updateProject(request, id),
  );
}
