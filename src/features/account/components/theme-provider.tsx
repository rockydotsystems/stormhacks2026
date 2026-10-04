"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { parseTheme, themeStorageKey, type ThemePreference } from "../theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  resolvedTheme: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    let current: ThemePreference = "system";
    const apply = () => {
      const theme =
        current === "system" ? (media.matches ? "dark" : "light") : current;
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
      setPreferenceState(current);
      setResolvedTheme(theme);
    };
    const read = () => {
      try {
        current = parseTheme(localStorage.getItem(themeStorageKey));
      } catch {}
      apply();
    };
    const change = (event: Event) => {
      current = (event as CustomEvent<ThemePreference>).detail;
      apply();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null) read();
    };
    read();
    media.addEventListener("change", apply);
    window.addEventListener("storage", storage);
    window.addEventListener("theme-preference", change);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", storage);
      window.removeEventListener("theme-preference", change);
    };
  }, []);

  function setPreference(next: ThemePreference) {
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {}
    window.dispatchEvent(new CustomEvent("theme-preference", { detail: next }));
  }

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme requires ThemeProvider");
  return theme;
}
