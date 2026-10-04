import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "@/server/errors";

export const randomState = () =>
  Buffer.from(randomBytes(32)).toString("base64url");
export const hashState = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const challenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

export function verifySignature(
  body: Uint8Array,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    throw new ApiError(401, "Invalid GitHub webhook signature.");
  const expected = createHmac("sha256", secret).update(body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
    throw new ApiError(401, "Invalid GitHub webhook signature.");
}

export async function readLimitedBody(
  request: Pick<Request, "headers" | "body">,
  limit = 1024 * 1024,
) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new ApiError(413, "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ApiError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
