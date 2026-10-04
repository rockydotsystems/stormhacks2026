export type ThemePreference = "light" | "dark" | "system";
export const themeStorageKey = "why-theme";

export function parseTheme(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

// Runs before paint; keep this self-contained for the inline bootstrap.
export function initializeTheme() {
  let preference = "system";
  try {
    preference = localStorage.getItem("why-theme") || "system";
  } catch {}
  const dark =
    preference === "dark" ||
    (preference !== "light" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export const themeScript = `(${initializeTheme.toString()})()`;
