import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  challenge,
  hashState,
  randomState,
  readLimitedBody,
  verifySignature,
} from "./security";

describe("GitHub boundary security", () => {
  it("generates independent URL-safe state and PKCE values", () => {
    const first = randomState();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomState()).not.toBe(first);
    expect(hashState(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("verifies raw bytes, rejecting changed content, wrong secrets and malformed signatures", () => {
    const body = Buffer.from('{"hello":"世界"}\n');
    const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
    expect(() => verifySignature(body, signature, "test-secret")).not.toThrow();
    for (const bad of [
      null,
      "",
      "sha1=abc",
      "sha256=abc",
      `sha256=${"z".repeat(64)}`,
    ])
      expect(() => verifySignature(body, bad, "test-secret")).toThrow(
        "signature",
      );
    expect(() =>
      verifySignature(
        Buffer.from(body.toString().trim()),
        signature,
        "test-secret",
      ),
    ).toThrow("signature");
    expect(() => verifySignature(body, signature, "other-secret")).toThrow(
      "signature",
    );
  });

  it("enforces body limits with and without Content-Length", async () => {
    await expect(
      readLimitedBody(
        new Request("https://app.test", { method: "POST", body: "12345" }),
        4,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readLimitedBody(
        new Request("https://app.test", {
          method: "POST",
          headers: { "Content-Length": "10" },
          body: "x",
        }),
        4,
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(
      (
        await readLimitedBody(
          new Request("https://app.test", { method: "POST", body: "1234" }),
          4,
        )
      ).toString(),
    ).toBe("1234");
  });
});
