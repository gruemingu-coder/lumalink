import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { loadFromStorage, saveToStorage } from "./storage";

export type ThemeId = "dark" | "light" | "purple" | "sky";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Page-background hex, used for the swatch preview and the mobile
   * browser chrome color (`<meta name="theme-color">`). */
  previewBg: string;
  previewAccent: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "dark", label: "다크", previewBg: "#07080d", previewAccent: "#7457ff" },
  { id: "light", label: "라이트", previewBg: "#f4f5fa", previewAccent: "#6238f0" },
  { id: "purple", label: "퍼플", previewBg: "#0d0716", previewAccent: "#a83ee8" },
  { id: "sky", label: "스카이블루", previewBg: "#060c16", previewAccent: "#2b8fe0" },
];

const THEME_KEY = "theme";
const DEFAULT_THEME: ThemeId = "dark";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  options: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  const option = THEME_OPTIONS.find((o) => o.id === theme);
  if (meta && option) {
    meta.setAttribute("content", option.previewBg);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() =>
    loadFromStorage<ThemeId>(THEME_KEY, DEFAULT_THEME)
  );

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    saveToStorage(THEME_KEY, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, options: THEME_OPTIONS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme은 ThemeProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
