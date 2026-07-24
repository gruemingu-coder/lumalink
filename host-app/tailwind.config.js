/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: {
          950: "#08090d",
          900: "#0e1016",
          800: "#161923",
          700: "#232733",
          600: "#343a49",
        },
        brand: {
          300: "#b3c1ff",
          400: "#8aa0ff",
          500: "#6478ff",
          600: "#4c5ce6",
        },
        accent: {
          400: "#34e0c8",
          500: "#1fc9b1",
        },
        danger: {
          400: "#ff8585",
          500: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
