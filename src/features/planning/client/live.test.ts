import { describe, expect, it } from "vitest";
import {
  authorHue,
  initials,
  liveUrl,
  nameList,
  needsStandbySync,
  parseLiveMessage,
  reconnectDelay,
} from "@/features/planning/client/live";

describe("parseLiveMessage", () => {
  it("reads a presence message", () => {
    expect(
      parseLiveMessage(
        JSON.stringify({
          type: "presence",
          users: [{ userId: "a", displayName: "Ana S." }],
        }),
      ),
    ).toEqual({
      type: "presence",
      users: [{ userId: "a", displayName: "Ana S." }],
    });
  });

  it("drops malformed users but keeps the well formed ones", () => {
    const parsed = parseLiveMessage(
      JSON.stringify({
        type: "presence",
        users: [{ userId: "a", displayName: "Ana" }, { userId: 3 }, null, "x"],
      }),
    );
    expect(parsed).toEqual({
      type: "presence",
      users: [{ userId: "a", displayName: "Ana" }],
    });
  });

  it("reads a change message with a known reason only", () => {
    expect(
      parseLiveMessage(JSON.stringify({ type: "changed", reason: "document" })),
    ).toEqual({ type: "changed", reason: "document" });
    expect(
      parseLiveMessage(JSON.stringify({ type: "changed", reason: "dance" })),
    ).toBeNull();
  });

  it("ignores pongs, binary data, bad JSON and unknown types", () => {
    for (const data of [
      "pong",
      new ArrayBuffer(2),
      "{",
      "null",
      JSON.stringify({ type: "other" }),
      JSON.stringify({ type: "presence", users: "no" }),
    ]) {
      expect(parseLiveMessage(data)).toBeNull();
    }
  });
});

describe("liveUrl", () => {
  it("follows the page's scheme and host", () => {
    expect(liveUrl({ protocol: "https:", host: "app.test" }, "abc")).toBe(
      "wss://app.test/api/planning/conversations/abc/live",
    );
    expect(liveUrl({ protocol: "http:", host: "localhost:3000" }, "abc")).toBe(
      "ws://localhost:3000/api/planning/conversations/abc/live",
    );
  });
});

describe("reconnectDelay", () => {
  it("backs off and then holds at about fifteen seconds", () => {
    const middle = () => 0.5;
    expect([0, 1, 2, 3, 4, 10].map((n) => reconnectDelay(n, middle))).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000,
    ]);
  });

  it("stays within twenty percent of the base", () => {
    expect(reconnectDelay(0, () => 0)).toBe(800);
    expect(reconnectDelay(0, () => 1)).toBe(1200);
  });
});

describe("needsStandbySync", () => {
  it("asks when two are here and the chat is active, or fewer are here and it is quiet", () => {
    expect(needsStandbySync("active", 2)).toBe(true);
    expect(needsStandbySync("active", 3)).toBe(true);
    expect(needsStandbySync("standby", 1)).toBe(true);
    expect(needsStandbySync("standby", 0)).toBe(true);
  });

  it("does not ask when the mode already matches", () => {
    expect(needsStandbySync("active", 1)).toBe(false);
    expect(needsStandbySync("active", 0)).toBe(false);
    expect(needsStandbySync("standby", 2)).toBe(false);
  });
});

describe("people helpers", () => {
  it("gives the same hue to the same person, within the circle", () => {
    expect(authorHue("user-ana")).toBe(authorHue("user-ana"));
    expect(authorHue("user-ana")).not.toBe(authorHue("user-ben"));
    for (const id of ["a", "user-ana", "ü"]) {
      expect(authorHue(id)).toBeGreaterThanOrEqual(0);
      expect(authorHue(id)).toBeLessThan(360);
    }
  });

  it("takes initials from the first two words", () => {
    expect(initials("Ana S.")).toBe("AS");
    expect(initials("ben")).toBe("B");
    expect(initials("  ")).toBe("?");
  });

  it("joins names for a sentence", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Ana S."])).toBe("Ana S.");
    expect(nameList(["Ana S.", "Ben K."])).toBe("Ana S. and Ben K.");
    expect(nameList(["Ana S.", "Ben K.", "Cy L."])).toBe(
      "Ana S., Ben K. and Cy L.",
    );
  });
});
