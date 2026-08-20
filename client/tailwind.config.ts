import type { Config } from "tailwindcss";

// Design tokens for Fulfilio's ops-console direction: a graphite console
// (not the light "warm paper" template look) with one warehouse-amber
// signal color and a distinct freight-blue for "in motion" states.
// See client/DESIGN.md for the full rationale.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./context/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#0C0D10",
          900: "#14161A",
          800: "#1B1E23",
          700: "#252932",
          600: "#343A45",
          500: "#4A5261",
          400: "#6B7280",
          300: "#9CA3AF",
          200: "#D1D5DB",
          100: "#E9EAEC",
          50: "#F5F6F4",
        },
        amber: {
          600: "#B9820F",
          500: "#E0A526",
          400: "#F0BE4E",
        },
        freight: {
          600: "#2F5FD6",
          500: "#4C7EF3",
          400: "#7DA1F6",
        },
        signal: {
          red: "#D64545",
          green: "#3F9A5C",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "JetBrains Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      letterSpacing: {
        widest2: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
