import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#e6f0ff",
          100: "#cce0ff",
          200: "#99c2ff",
          300: "#66a3ff",
          400: "#3385ff",
          500: "#0071e3",
          600: "#0071e3",
          700: "#0064cc",
          800: "#0050a0",
          900: "#003c78",
          950: "#002550",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "SF Pro Display", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
      },
      boxShadow: {
        sm:  "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        md:  "0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        lg:  "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
        xl:  "0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
