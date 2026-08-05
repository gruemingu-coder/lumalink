/** @type {import('tailwindcss').Config} */

/**
 * Reads color from a CSS custom property (set per-theme in `src/index.css`
 * via `[data-theme="…"]`) so every existing `bg-base-950`, `text-slate-400`,
 * `text-brand-400`, etc. utility automatically re-colors when the theme
 * changes — no per-component edits needed. Still supports Tailwind's
 * opacity modifiers (e.g. `bg-brand-600/15`).
 */
function withOpacity(variable) {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(${variable}))`
      : `rgb(var(${variable}) / ${opacityValue})`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: {
          950: withOpacity("--color-base-950"),
          900: withOpacity("--color-base-900"),
          850: withOpacity("--color-base-850"),
          800: withOpacity("--color-base-800"),
          700: withOpacity("--color-base-700"),
          600: withOpacity("--color-base-600"),
          500: withOpacity("--color-base-500"),
        },
        brand: {
          50: withOpacity("--color-brand-50"),
          100: withOpacity("--color-brand-100"),
          200: withOpacity("--color-brand-200"),
          300: withOpacity("--color-brand-300"),
          400: withOpacity("--color-brand-400"),
          500: withOpacity("--color-brand-500"),
          600: withOpacity("--color-brand-600"),
          700: withOpacity("--color-brand-700"),
          800: withOpacity("--color-brand-800"),
          900: withOpacity("--color-brand-900"),
        },
        accent: {
          400: withOpacity("--color-accent-400"),
          500: withOpacity("--color-accent-500"),
          600: withOpacity("--color-accent-600"),
        },
        // Overrides Tailwind's built-in `slate` scale (used throughout for
        // body text) so it also flips per-theme.
        slate: {
          50: withOpacity("--color-slate-100"),
          100: withOpacity("--color-slate-100"),
          200: withOpacity("--color-slate-200"),
          300: withOpacity("--color-slate-300"),
          400: withOpacity("--color-slate-400"),
          500: withOpacity("--color-slate-500"),
          600: withOpacity("--color-slate-600"),
          700: withOpacity("--color-slate-700"),
          800: withOpacity("--color-slate-700"),
          900: withOpacity("--color-slate-700"),
        },
        /** Strongest foreground color for text sitting directly on the
         * page/panel background (headings, wordmark) — white on dark
         * themes, near-black on the light theme. Deliberately separate
         * from literal `text-white` used on solid brand/danger buttons,
         * which must stay white in every theme. */
        heading: withOpacity("--color-heading"),
        warn: {
          400: "#ffb454",
          500: "#ff9c33",
        },
        danger: {
          400: "#ff6b7a",
          500: "#f43f5e",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--color-brand-500) / 0.4), 0 0 24px rgb(var(--color-brand-500) / 0.25)",
        "glow-accent":
          "0 0 0 1px rgb(var(--color-accent-500) / 0.4), 0 0 24px rgb(var(--color-accent-500) / 0.25)",
        panel: "0 8px 30px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at top, rgb(var(--color-brand-500) / 0.18), transparent 55%)",
        "hero-glow":
          "radial-gradient(60% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.35) 0%, rgb(var(--color-base-950) / 0) 70%)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "80%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
        "scan-line": "scan-line 2.4s linear infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
