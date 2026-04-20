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
          50: "#eff2fd",
          100: "#dde4fb",
          200: "#c2ccf8",
          300: "#97aaf2",
          400: "#6680ea",
          500: "#4561e2",
          600: "#2d47e2",
          700: "#2336c4",
          800: "#212ea0",
          900: "#1e2a7e",
          950: "#151b52",
        },
      },
      fontFamily: { sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "monospace"] },
    },
  },
  plugins: [],
};
export default config;
