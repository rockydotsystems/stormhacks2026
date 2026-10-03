import { handleApi } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  return handleApi(({ notesController }) => notesController.list());
}

export async function POST(request: Request) {
  return handleApi(({ notesController }) => notesController.create(request));
}
