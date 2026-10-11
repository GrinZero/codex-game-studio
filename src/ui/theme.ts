import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "codex_theme";

export function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyTheme(theme: Theme): "dark" | "light" {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(resolved);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        "content",
        resolved === "dark" ? "#18181b" : "#ffffff",
      );
    }
  }
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    let saved: Theme | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {}
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "dark";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() =>
    applyTheme(theme),
  );

  useEffect(() => {
    const resolved = applyTheme(theme);
    setResolvedTheme(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => {
        setResolvedTheme(applyTheme("system"));
      };
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      return next;
    });
  };

  return { theme, resolvedTheme, setTheme: setThemeState, toggleTheme };
}
