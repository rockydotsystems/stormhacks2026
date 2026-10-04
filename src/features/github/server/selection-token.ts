import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getGitHubConfig } from "./config";
import { ApiError } from "@/server/errors";

function encryptionKey() {
  return createHash("sha256")
    .update(
      `github-installation-selection:v1:${getGitHubConfig().clientSecret}`,
    )
    .digest();
}

export function sealToken(token: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

export function openToken(value: string, context: string) {
  try {
    const bytes = Buffer.from(value, "base64url");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      bytes.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ApiError(
      400,
      "GitHub authorization expired. Connect GitHub again.",
    );
  }
}
