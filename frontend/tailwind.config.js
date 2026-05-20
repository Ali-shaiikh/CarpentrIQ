/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CarpentrIQ design system — see CLAUDE.md § Frontend Design System
        forest: "#1B3A2D",
        "forest-mid": "#2D5A43",
        "forest-deep": "#0E2118",
        gold: "#C9A84C",
        "gold-light": "#E8C96E",
        teak: "#3D2B1F",
        parchment: "#F5F0E8",
        "parchment-dark": "#EDE8DF",
        mist: "#E8E4DC",
        slate: "#4A5568",
        "slate-light": "#6B7280",
      },
      fontFamily: {
        serif: ['"DM Serif Display"', "serif"],
        sans: ['"DM Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      borderRadius: {
        btn: "4px",
        card: "10px",
      },
      transitionDuration: {
        btn: "150ms",
      },
      boxShadow: {
        card: "0 2px 12px rgba(27,58,45,0.08), 0 1px 3px rgba(27,58,45,0.06)",
        "card-hover": "0 8px 32px rgba(27,58,45,0.14), 0 2px 8px rgba(27,58,45,0.08)",
        "gold": "0 0 0 1px rgba(201,168,76,0.3), 0 2px 12px rgba(201,168,76,0.12)",
      },
    },
  },
  plugins: [],
};
