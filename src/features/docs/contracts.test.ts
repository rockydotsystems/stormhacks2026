import { describe, expect, it } from "vitest";
import { changeIdSchema, snapshotSchema } from "@/features/docs/contracts";

describe("docs input contracts", () => {
  it("accepts full snapshots, including empty markdown, but requires a title", () => {
    expect(snapshotSchema.parse({ title: " ADR title ", content: "" })).toEqual(
      { title: "ADR title", content: "" },
    );
    expect(
      snapshotSchema.safeParse({ title: " ", content: "text" }).success,
    ).toBe(false);
  });

  it("validates bigint snapshot IDs without converting them to unsafe JS numbers", () => {
    expect(changeIdSchema.parse("9223372036854775807")).toBe(
      "9223372036854775807",
    );
    for (const value of ["0", "-1", "1.5", "01", "9223372036854775808"]) {
      expect(changeIdSchema.safeParse(value).success).toBe(false);
    }
  });
});
