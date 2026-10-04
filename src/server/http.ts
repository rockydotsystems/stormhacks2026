import "server-only";
import { NextResponse } from "next/server";
import { container, type Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";

function errorResponse(error: unknown): Response {
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
}

export async function handleApi(
  handler: (dependencies: Dependencies) => Promise<Response>,
): Promise<Response> {
  const scope = container.createScope();
  try {
    return await handler(scope.cradle);
  } catch (error) {
    return errorResponse(error);
  } finally {
    await scope.dispose();
  }
}

/**
 * For responses whose body outlives the handler, such as Server-Sent Events. The request scope
 * (and its database connection) must stay open while the body streams, so the handler receives
 * a `release` callback and calls it when the stream ends. If the handler throws, the scope is
 * released here and the error becomes a normal JSON response. `release` is safe to call twice.
 */
export async function handleApiStream(
  handler: (
    dependencies: Dependencies,
    release: () => Promise<void>,
  ) => Promise<Response>,
): Promise<Response> {
  const scope = container.createScope();
  let released: Promise<void> | null = null;
  const release = () => (released ??= scope.dispose());
  try {
    return await handler(scope.cradle, release);
  } catch (error) {
    await release();
    return errorResponse(error);
  }
}
