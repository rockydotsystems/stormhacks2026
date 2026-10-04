import { container } from "../src/server/container";

// Every background invocation owns and disposes its database client independently of HTTP.
export async function processReviewJob() {
  const scope = container.createScope();
  try {
    await scope.cradle.githubReviewService.processNext();
  } finally {
    await scope.dispose();
  }
}
