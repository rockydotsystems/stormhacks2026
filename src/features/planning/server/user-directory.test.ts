import { describe, expect, it } from "vitest";
import { formatDisplayName } from "@/features/planning/server/user-directory";

describe("formatDisplayName", () => {
  it("shortens the last name to an initial", () => {
    expect(formatDisplayName({ firstName: "Ana", lastName: "silva" })).toBe(
      "Ana S.",
    );
  });

  it("uses the first name alone when there is no last name", () => {
    expect(formatDisplayName({ firstName: " Ana ", lastName: null })).toBe(
      "Ana",
    );
  });

  it("falls back to the email name, then to a generic name", () => {
    expect(formatDisplayName({ email: "ben.k@example.com" })).toBe("ben.k");
    expect(formatDisplayName({})).toBe("Teammate");
  });
});
