import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseTheme, themeScript } from "./theme";

describe("theme initialization", () => {
  it.each([
    [null, true, "dark"],
    [null, false, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["invalid", true, "dark"],
  ])(
    "resolves %s with system dark=%s to %s before paint",
    (stored, systemDark, expected) => {
      const classes = new Set<string>();
      const style = { colorScheme: "" };
      runInNewContext(themeScript, {
        localStorage: { getItem: () => stored },
        matchMedia: () => ({ matches: systemDark }),
        document: {
          documentElement: {
            style,
            classList: {
              toggle: (name: string, enabled: boolean) =>
                enabled ? classes.add(name) : classes.delete(name),
            },
          },
        },
      });
      expect(style.colorScheme).toBe(expected);
      expect(classes.has("dark")).toBe(expected === "dark");
    },
  );

  it("follows the system when storage is unavailable", () => {
    const style = { colorScheme: "" };
    runInNewContext(themeScript, {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      matchMedia: () => ({ matches: true }),
      document: { documentElement: { style, classList: { toggle: () => {} } } },
    });
    expect(style.colorScheme).toBe("dark");
  });

  it("treats missing or invalid stored preferences as system", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("invalid")).toBe("system");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });
});
