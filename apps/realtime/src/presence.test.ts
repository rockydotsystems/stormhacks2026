import { describe, expect, it } from "vitest";
import {
  GRACE_MS,
  dropExpired,
  listPresence,
  nextAlarm,
  startLeaving,
  stopLeaving,
} from "./presence";

const ana = { userId: "a", displayName: "Ana S." };
const ben = { userId: "b", displayName: "Ben K." };

describe("listPresence", () => {
  it("lists each connected person once, even with several sockets", () => {
    expect(listPresence([ben, ana, ana], {}, 0)).toEqual([ana, ben]);
  });

  it("keeps a person during the grace period and drops them after it", () => {
    const leaving = startLeaving({}, ben, 1_000);
    expect(listPresence([ana], leaving, 1_000 + GRACE_MS - 1)).toEqual([
      ana,
      ben,
    ]);
    expect(listPresence([ana], leaving, 1_000 + GRACE_MS)).toEqual([ana]);
  });

  it("does not double count someone who reconnects inside the grace period", () => {
    const leaving = startLeaving({}, ben, 0);
    expect(listPresence([ana, ben], leaving, 1)).toEqual([ana, ben]);
  });
});

describe("leaving", () => {
  it("stopLeaving clears the entry and leaves other people alone", () => {
    const leaving = startLeaving(startLeaving({}, ana, 0), ben, 0);
    expect(Object.keys(stopLeaving(leaving, "a"))).toEqual(["b"]);
    expect(stopLeaving(leaving, "nobody")).toBe(leaving);
  });

  it("dropExpired reports whether anything expired", () => {
    const leaving = startLeaving(startLeaving({}, ana, 0, 5), ben, 0, 50);
    const first = dropExpired(leaving, 10);
    expect(Object.keys(first.leaving)).toEqual(["b"]);
    expect(first.changed).toBe(true);
    expect(dropExpired(first.leaving, 11).changed).toBe(false);
  });

  it("nextAlarm is the earliest end, or null with nobody leaving", () => {
    expect(nextAlarm({})).toBeNull();
    const leaving = startLeaving(startLeaving({}, ana, 0, 50), ben, 0, 5);
    expect(nextAlarm(leaving)).toBe(5);
  });
});
