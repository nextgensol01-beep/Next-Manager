"use client";
import { signOut } from "next-auth/react";
import { Session } from "next-auth";
import { useEffect, useState } from "react";
import { LogOut, Sun, Moon, Menu, X } from "lucide-react";
import Image from "next/image";
import { useTheme } from "@/app/providers";

interface Props {
  session: Session;
  onMenuClick: () => void;
  sidebarOpen: boolean;
}

interface DashboardContextTitle {
  title: string;
  subtitle?: string;
  progress?: number;
}

export default function TopBar({ session, onMenuClick, sidebarOpen }: Props) {
  const { dark, toggle } = useTheme();
  const [contextTitle, setContextTitle] = useState<DashboardContextTitle | null>(null);

  useEffect(() => {
    const handleContextTitle = (event: Event) => {
      const detail = (event as CustomEvent<DashboardContextTitle | null>).detail;
      setContextTitle(detail && detail.title ? detail : null);
    };

    window.addEventListener("dashboard:context-title", handleContextTitle as EventListener);
    return () => window.removeEventListener("dashboard:context-title", handleContextTitle as EventListener);
  }, []);

  const contextProgress = Math.max(0, Math.min(1, contextTitle?.progress ?? 0));
  const compactTitleStyle = {
    opacity: contextProgress,
    transform: `translateY(${(1 - contextProgress) * 8}px) scale(${0.9 + (contextProgress * 0.1)})`,
    filter: `blur(${(1 - contextProgress) * 6}px)`,
    pointerEvents: contextProgress > 0.15 ? "auto" : "none",
  } as const;

  return (
    <header className="h-14 bg-header border-b border-base flex items-center justify-between px-3 sm:px-6 flex-shrink-0 transition-colors gap-2">

      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90 flex-shrink-0"
        style={{ backgroundColor: "var(--color-border-soft)", color: "var(--color-text-muted)" }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-border)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--color-border-soft)"; }}
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? "Close menu" : "Open menu"}
      >
        <span
          className="inline-flex transition-transform duration-200"
          style={{ transform: sidebarOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </span>
      </button>

      {/* Mobile brand */}
      <div className="lg:hidden flex items-center flex-1 min-w-0">
        <span className="text-sm font-bold text-default truncate">Nextgen Solutions</span>
      </div>

      {/* Desktop context title */}
      <div className="hidden lg:flex flex-1 min-w-0 items-center">
        <div
          className="min-w-0 max-w-[min(42vw,560px)] transition-[opacity,transform,filter] duration-300 ease-out will-change-transform"
          style={compactTitleStyle}
          aria-hidden={contextProgress <= 0.05}
        >
          {contextTitle && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-default truncate">{contextTitle.title}</p>
              {contextTitle.subtitle && (
                <p className="text-[11px] text-muted truncate">{contextTitle.subtitle}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">

        {/* User info — always visible, truncated on small screens */}
        <div className="text-right mr-1">
          <p className="text-sm font-semibold text-default leading-tight truncate max-w-[120px] sm:max-w-[180px]">
            {session.user?.name}
          </p>
          <p className="text-xs text-muted truncate max-w-[120px] sm:max-w-[180px]">
            {session.user?.email}
          </p>
        </div>

        {/* Avatar */}
        {session.user?.image && (
          <Image
            src={session.user.image}
            alt="avatar"
            width={30}
            height={30}
            className="rounded-full border border-base flex-shrink-0 hidden sm:block"
          />
        )}

        {/* Dark/light toggle — spins on click, correct icon each mode */}
        <button
          onClick={toggle}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90 group"
          style={{ backgroundColor: "var(--color-border-soft)", color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--color-border-soft)"; }}
        >
          {/* Icon swaps, wrapper spins 360° on mode change */}
          <span
            key={dark ? "dark" : "light"}
            className="inline-flex theme-icon-spin"
          >
            {dark
              ? <Sun className="w-4 h-4 text-amber-400" />
              : <Moon className="w-4 h-4" />
            }
          </span>
        </button>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90"
          style={{ backgroundColor: "var(--color-border-soft)", color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--color-border-soft)"; }}
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
