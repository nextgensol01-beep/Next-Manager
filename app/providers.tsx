"use client";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { createContext, useContext, useEffect, useState } from "react";

const ThemeCtx = createContext({ dark: false, toggle: () => {} });
export const ThemeContext = ThemeCtx;
export const useTheme = () => useContext(ThemeCtx);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved ? saved === "dark" : prefersDark;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <ThemeCtx.Provider value={{ dark, toggle }}>
      <SessionProvider>
        {children}
        <Toaster position="top-right" toastOptions={{
          style: { background: dark ? "#161b22" : "#fff", color: dark ? "#e6edf3" : "#1e293b", border: `1px solid ${dark ? "#30363d" : "#e2e8f0"}` }
        }} />
      </SessionProvider>
    </ThemeCtx.Provider>
  );
}
