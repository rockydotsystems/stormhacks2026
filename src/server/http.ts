import "server-only";
import { NextResponse } from "next/server";
import { container, type Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";

export async function handleApi(
  handler: (dependencies: Dependencies) => Promise<Response>,
): Promise<Response> {
  const scope = container.createScope();
  try {
    return await handler(scope.cradle);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  } finally {
    await scope.dispose();
  }
}
