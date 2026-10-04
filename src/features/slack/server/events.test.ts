import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mentionQuestion, mentionSchema, readSlackEvent } from "./events";

const secret = "test-signing-secret";
const now = 1800000000000;
function request(
  body: string,
  timestamp = String(now / 1000),
  signature?: string,
) {
  return new Request("https://example.com/api/slack/events", {
    method: "POST",
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature":
        signature ||
        `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
    },
    body,
  });
}
export const mention = {
  type: "event_callback" as const,
  event_id: "Ev123",
  team_id: "T123",
  api_app_id: "A123",
  event: {
    type: "app_mention" as const,
    user: "U123",
    channel: "C123",
    text: "<@U999>, why are we using an mssql database?",
    ts: "123.456",
  },
};

describe("Slack signed events", () => {
  it("verifies the exact body and returns the URL challenge", async () => {
    const body = JSON.stringify({
      type: "url_verification",
      challenge: "hello",
    });
    expect(await readSlackEvent(request(body), secret, now)).toEqual({
      type: "url_verification",
      challenge: "hello",
    });
  });
  it("rejects modified bodies, missing signatures, and stale or future timestamps", async () => {
    await expect(
      readSlackEvent(
        request("{}", undefined, `v0=${"0".repeat(64)}`),
        secret,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      readSlackEvent(
        new Request("https://example.com", { method: "POST", body: "{}" }),
        secret,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
    for (const offset of [-301, 301]) {
      await expect(
        readSlackEvent(request("{}", String(now / 1000 + offset)), secret, now),
      ).rejects.toMatchObject({ status: 401 });
    }
  });
  it("rejects oversized bodies and malformed signed JSON", async () => {
    await expect(
      readSlackEvent(request("x".repeat(65537)), secret, now),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readSlackEvent(request("{"), secret, now),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("extracts the example question and preserves thread IDs", () => {
    expect(mentionQuestion(mentionSchema.parse(mention))).toBe(
      "why are we using an mssql database?",
    );
    expect(
      mentionSchema.parse({
        ...mention,
        event: { ...mention.event, thread_ts: "111.222" },
      }).event.thread_ts,
    ).toBe("111.222");
  });
});
