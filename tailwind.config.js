/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: {
          950: "#07080d",
          900: "#0c0e16",
          850: "#111421",
          800: "#161a2c",
          700: "#1f2438",
          600: "#2b3150",
          500: "#3a4268",
        },
        brand: {
          50: "#f1f0ff",
          100: "#e4e1ff",
          200: "#c9c3ff",
          300: "#a99eff",
          400: "#8b7bff",
          500: "#7457ff",
          600: "#6238f0",
          700: "#4f2ccb",
          800: "#3f24a1",
          900: "#332080",
        },
        accent: {
          400: "#3fe0c5",
          500: "#1ecbb0",
          600: "#14a693",
        },
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
        glow: "0 0 0 1px rgba(116,87,255,0.4), 0 0 24px rgba(116,87,255,0.25)",
        "glow-accent": "0 0 0 1px rgba(31,203,176,0.4), 0 0 24px rgba(31,203,176,0.25)",
        panel: "0 8px 30px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at top, rgba(116,87,255,0.18), transparent 55%)",
        "hero-glow":
          "radial-gradient(60% 60% at 50% 0%, rgba(116,87,255,0.35) 0%, rgba(7,8,13,0) 70%)",
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
