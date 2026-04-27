"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, UserCircle, Calendar, ArrowLeftRight,
  Receipt, BarChart2, FileText, ClipboardCheck, Trash2, Mail, X, Settings2,
  Upload, ChevronDown,
} from "lucide-react";
import { cachedFetch } from "@/lib/cache";

const navItems = [
  { href: "/dashboard",                     label: "Dashboard",           icon: LayoutDashboard },
  { href: "/dashboard/clients",             label: "Clients",             icon: Users },
  { href: "/dashboard/contacts",            label: "Contacts",            icon: UserCircle },
  { href: "/dashboard/financial-year",      label: "Financial Year",      icon: Calendar },
  { href: "/dashboard/credit-transactions", label: "Credit Transactions", icon: ArrowLeftRight },
  { href: "/dashboard/annual-return",       label: "EPR Annual Return",   icon: ClipboardCheck },
  { href: "/dashboard/billing",             label: "Billing & Payments",  icon: Receipt },
  { href: "/dashboard/reports",             label: "Reports",             icon: BarChart2 },
  { href: "/dashboard/quotation",           label: "Quotation Generator", icon: FileText },
  { href: "/dashboard/settings",            label: "Settings",            icon: Settings2 },
];

const portalOpsItems = [
  { href: "/dashboard/cpcb-uploads/invoice-tracking", label: "Invoice Tracking", icon: FileText },
  { href: "/dashboard/cpcb-uploads/upload-records", label: "Upload Records", icon: Upload },
];

interface Props { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname();
  const [trashCount, setTrashCount] = useState(0);
  const [emailCount, setEmailCount] = useState(0);
  const [drawerVisible, setDrawerVisible]   = useState(false);
  const [drawerRendered, setDrawerRendered] = useState(false);
  const portalOpsActive = portalOpsItems.some(({ href }) => pathname.startsWith(href));
  const [portalOpsOpen, setPortalOpsOpen] = useState(portalOpsActive);

  useEffect(() => { onClose(); }, [pathname, onClose]);

  useEffect(() => {
    if (portalOpsActive) {
      setPortalOpsOpen(true);
    }
  }, [portalOpsActive]);

  useEffect(() => {
    if (open) {
      setDrawerRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setDrawerVisible(true)));
    } else {
      setDrawerVisible(false);
      const t = setTimeout(() => setDrawerRendered(false), 260);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    cachedFetch<unknown[]>("/api/trash?type=all")
      .then((d) => { if (Array.isArray(d)) setTrashCount(d.length); }).catch(() => {});
    cachedFetch<unknown[]>("/api/email-log")
      .then((d) => { if (Array.isArray(d)) setEmailCount(d.length); }).catch(() => {});
  }, [pathname]);

  const content = (
    <aside className="sidebar-panel w-[256px] flex-shrink-0 flex flex-col h-full" style={{overflow: "hidden"}}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b sidebar-divider">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{background: "#0071e3", boxShadow: "0 3px 10px rgba(0,113,227,0.35)"}}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="sidebar-text-primary font-semibold text-[13px] leading-tight" style={{letterSpacing: "-0.01em"}}>Nextgen Solutions</p>
            <p className="sidebar-text-faint text-[11px] mt-0.5">EPR Consultancy</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg sidebar-text-muted transition-all duration-150 active:scale-90 hover:bg-[var(--sidebar-hover-bg)]">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-hidden">
        <p className="sidebar-text-faint text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5">Navigation</p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={cn("sidebar-link", isActive && "active")}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}

        <div className="pt-4 pb-1">
          <p className="sidebar-text-faint text-[10px] font-semibold uppercase tracking-widest px-4">Portal Operations</p>
        </div>

        <button
          type="button"
          onClick={() => setPortalOpsOpen((value) => !value)}
          className={cn(
            "sidebar-link w-full justify-between",
            portalOpsActive && "active"
          )}
          aria-expanded={portalOpsOpen}
        >
          <span className="flex items-center gap-3">
            <Upload className="w-4 h-4 flex-shrink-0" />
            CPCB Uploads
          </span>
          <ChevronDown
            className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
            style={{ transform: portalOpsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            maxHeight: portalOpsOpen ? "160px" : "0px",
            opacity: portalOpsOpen ? 1 : 0,
          }}
          aria-hidden={!portalOpsOpen}
        >
          <div
            className="mt-1 mb-2 space-y-1 pl-4 transition-all duration-300 ease-out"
            style={{ transform: portalOpsOpen ? "translateY(0)" : "translateY(-8px)" }}
          >
            {portalOpsItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                      : "sidebar-text-muted hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-primary)]"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="pt-4 pb-1">
          <p className="sidebar-text-faint text-[10px] font-semibold uppercase tracking-widest px-4">System</p>
        </div>

        <Link href="/dashboard/email-history" className={cn("sidebar-link", pathname.startsWith("/dashboard/email-history") && "active")}>
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Email History</span>
          {emailCount > 0 && <span className="sidebar-badge-blue">{emailCount}</span>}
        </Link>

        <Link href="/dashboard/trash" className={cn("sidebar-link", pathname.startsWith("/dashboard/trash") && "active")}>
          <Trash2 className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Recycle Bin</span>
          {trashCount > 0 && <span className="sidebar-badge-red">{trashCount}</span>}
        </Link>
      </nav>

      <div className="border-t sidebar-divider p-4">
        <p className="sidebar-text-faint text-xs text-center">v2.0.0 · Internal Use Only</p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden lg:flex h-screen flex-shrink-0">{content}</div>

      {/* Mobile: animated slide-in drawer */}
      {drawerRendered && (
        <>
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{
              backgroundColor: drawerVisible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
              backdropFilter: drawerVisible ? "blur(2px)" : "none",
              transition: "background-color 0.25s, backdrop-filter 0.25s",
            }}
            onClick={onClose}
          />
          <div
            className="fixed inset-y-0 left-0 z-50 flex lg:hidden h-full"
            style={{
              transform: drawerVisible ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
              boxShadow: drawerVisible ? "4px 0 32px rgba(0,0,0,0.25)" : "none",
            }}
          >
            {content}
          </div>
        </>
      )}
    </>
  );
}
