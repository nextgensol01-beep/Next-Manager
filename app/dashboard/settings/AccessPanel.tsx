"use client";
import React, { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useSettingsSearch } from "./SettingsSearchContext";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import toast from "react-hot-toast";
import {
  UserPlus, Shield, RefreshCw, Trash2, Power, PowerOff,
  CheckCircle2, XCircle, KeyRound, ChevronRight, MoreHorizontal,
  MapPin, Monitor, Clock,
} from "lucide-react";
import { invalidate, useCache } from "@/lib/useCache";
import { parseDevice, type ParsedDevice } from "@/lib/device";
import { DeviceOsIcon, BrowserBrandIcon } from "@/components/ui/DeviceBrandIcon";
import ConfirmModal from "@/components/ui/ConfirmModal";

type ActiveSession = {
  id: string;
  userName: string;
  userEmail: string;
  provider?: "credentials" | "google";
  userAgent?: string;
  ip?: string;
  expires: string;
  createdAt: string;
  updatedAt: string;
  isCurrent: boolean;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  loginId: string;
  loginMethod: "password" | "google" | "both";
  loginMethods: string[];
  hasPasswordLogin: boolean;
  role: "admin" | "user";
  status: "active" | "disabled" | "pending" | "rejected";
  googleStatus: "none" | "pending" | "approved" | "rejected";
  googleRequestedAt?: string | null;
  googleApprovedAt?: string | null;
  createdAt?: string | null;
  originalCreatedAt?: string | null;
  lastLoginAt?: string | null;
  lastLoginProvider?: "credentials" | "google" | null;
  lastLoginIp?: string | null;
  lastLoginUserAgent?: string | null;
};

type ActionSheetAction = {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
};

/** Returns true when viewport width is below the md breakpoint (768px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

/**
 * Desktop dropdown menu — anchored to the trigger button.
 * Appears with a subtle scale+fade animation, closes on outside click or Escape.
 */
function DesktopDropdown({
  actions,
  anchor,
  onClose,
}: {
  actions: ActionSheetAction[];
  anchor: DOMRect;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const pos = {
    top: anchor.bottom + 6,
    left: Math.max(8, anchor.right - 200),
  };

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9000,
        width: "200px",
        transformOrigin: "top right",
        transform: visible ? "scale(1)" : "scale(0.92)",
        opacity: visible ? 1 : 0,
        transition: "transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 120ms ease",
        willChange: "transform, opacity",
      }}
    >
      <div
        className="rounded-xl overflow-hidden bg-card border border-[var(--color-border)]"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)" }}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { action.onClick(); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left transition-colors hover:bg-[var(--color-hover)] ${
              action.danger ? "text-[#FF3B30]" : "text-default"
            } ${i > 0 ? "border-t border-[var(--color-border)]" : ""}`}
          >
            <span className={`flex-shrink-0 ${action.danger ? "text-[#FF3B30]" : "text-muted"}`}>
              {action.icon}
            </span>
            {action.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

const emptyUserForm = {
  name: "",
  loginId: "",
  email: "",
  password: "",
  loginMethod: "password" as "password" | "google",
};


/**
 * Apple-level action sheet:
 * - Background recession via data-attribute CSS on actual content (not a fake layer)
 * - Unified spring physics: translate + scale + border-radius + shadow + opacity
 * - Child stagger with inertia
 * - Tactile press micro-interactions
 * - Full-viewport overlay including under topbar
 */
function ActionSheet({
  actions,
  onClose,
}: {
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"entering" | "open" | "closing">("entering");

  useEffect(() => {
    // Mark content element so CSS can apply recession transform
    const el = document.getElementById("dashboard-scroll-area");
    if (el) el.setAttribute("data-sheet-open", "true");
    const t = setTimeout(() => setPhase("open"), 520);
    return () => {
      clearTimeout(t);
      const el2 = document.getElementById("dashboard-scroll-area");
      if (el2) el2.removeAttribute("data-sheet-open");
    };
  }, []);

  const handleClose = () => {
    setPhase("closing");
    const el = document.getElementById("dashboard-scroll-area");
    if (el) el.removeAttribute("data-sheet-open");
    setTimeout(onClose, 320);
  };

  const isClosing = phase === "closing";

  // Portal renders sheet on document.body — escapes the blurred parent stacking context
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <>
      <style>{`
        /* ── Background recession on actual content ── */
        #dashboard-scroll-area[data-sheet-open="true"] {
          transform: perspective(1200px) rotateX(0.8deg) scale(0.974) translateY(-4px);
          transform-style: preserve-3d;
          transform-origin: 50% 100%;
          filter: blur(2px) brightness(0.88);
          border-radius: 16px;
          overflow: hidden;
          will-change: transform, filter;
          transition:
            transform 500ms cubic-bezier(0.32, 0.72, 0, 1),
            filter 500ms cubic-bezier(0.32, 0.72, 0, 1),
            border-radius 500ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        #dashboard-scroll-area {
          transform-origin: 50% 100%;
          transition:
            transform 320ms cubic-bezier(0.4, 0, 0.6, 1),
            filter 320ms cubic-bezier(0.4, 0, 0.6, 1),
            border-radius 320ms cubic-bezier(0.4, 0, 0.6, 1);
          border-radius: 0px;
        }

        /* ── Sheet spring ── */
        @keyframes as-sheet-in {
          0%   { transform: translateY(105%) scale(0.92); border-radius: 28px 28px 0 0; opacity: 0; }
          5%   { opacity: 1; }
          58%  { transform: translateY(-7px) scale(1.004); border-radius: 22px 22px 0 0; }
          74%  { transform: translateY(3px) scale(0.999); border-radius: 18px 18px 0 0; }
          88%  { transform: translateY(-1.5px) scale(1.001); border-radius: 16px 16px 0 0; }
          100% { transform: translateY(0) scale(1); border-radius: 16px 16px 0 0; opacity: 1; }
        }
        @keyframes as-sheet-out {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(110%) scale(0.95); opacity: 0; }
        }

        /* ── Overlay ── */
        @keyframes as-overlay-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes as-overlay-out { from { opacity: 1; } to { opacity: 0; } }

        /* ── Child row stagger ── */
        @keyframes as-row-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Shadow breathing ── */
        @keyframes as-shadow-settle {
          0%   { box-shadow: 0 0 0 rgba(0,0,0,0); }
          55%  { box-shadow: 0 -2px 60px rgba(0,0,0,0.26), 0 4px 20px rgba(0,0,0,0.14); }
          78%  { box-shadow: 0 -1px 44px rgba(0,0,0,0.20), 0 3px 14px rgba(0,0,0,0.11); }
          100% { box-shadow: 0 -1px 40px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.10); }
        }

        .as-sheet-entering { animation: as-sheet-in 520ms cubic-bezier(0.32, 0.72, 0, 1) forwards; }
        .as-sheet-closing  { animation: as-sheet-out 320ms cubic-bezier(0.4, 0, 1, 1) forwards; }
        .as-overlay-entering { animation: as-overlay-in 220ms ease forwards; }
        .as-overlay-closing  { animation: as-overlay-out 300ms ease forwards; }
        .as-card { animation: as-shadow-settle 520ms cubic-bezier(0.32, 0.72, 0, 1) forwards; }

        /* ── Tactile press ── */
        .as-btn {
          transition: transform 80ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 60ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .as-btn:active { transform: scale(0.97); opacity: 0.7; }
      `}</style>

      {/* Overlay — extends above viewport using negative top + padding trick */}
      <div
        className={isClosing ? "as-overlay-closing" : "as-overlay-entering"}
        style={{
          position: "fixed",
          top: "-200px",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: "200px",
          zIndex: 9990,
          backgroundColor: "rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}
      />

      {/* Tap-outside catcher */}
      <div
        style={{
          position: "fixed",
          top: "-200px",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: "200px",
          zIndex: 9991,
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={isClosing ? "as-sheet-closing" : "as-sheet-entering"}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          paddingLeft: "12px",
          paddingRight: "12px",
          paddingBottom: "max(28px, env(safe-area-inset-bottom))",
          transformOrigin: "50% 100%",
          willChange: "transform, opacity",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Actions card */}
        <div
          className="as-card overflow-hidden bg-card mb-3"
          style={{ borderRadius: "16px", border: "1px solid rgba(0,0,0,0.07)" }}
        >
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { action.onClick(); handleClose(); }}
              className={`as-btn w-full flex items-center gap-3 px-5 py-4 text-[15px] font-medium text-left ${
                action.danger ? "text-[#FF3B30]" : "text-default"
              } ${i > 0 ? "border-t border-[var(--color-border)]" : ""}`}
              style={{
                animation: `as-row-in 340ms cubic-bezier(0.32, 0.72, 0, 1) ${60 + i * 30}ms both`,
              }}
            >
              <span className={action.danger ? "text-[#FF3B30]" : "text-muted"} style={{ flexShrink: 0 }}>
                {action.icon}
              </span>
              {action.label}
            </button>
          ))}
        </div>

        {/* Cancel card */}
        <div
          className="as-card overflow-hidden bg-card"
          style={{
            borderRadius: "16px",
            border: "1px solid rgba(0,0,0,0.07)",
            animation: `as-row-in 340ms cubic-bezier(0.32, 0.72, 0, 1) ${60 + actions.length * 30 + 20}ms both`,
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="as-btn w-full px-5 py-4 text-[15px] font-semibold text-[#007AFF]"
          >
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

/** Fetch city/country from IP using ip-api.com (free, no key needed) */
function useIpLocation(ip?: string | null) {
  const [location, setLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ip) return;
    // Skip private/local IPs
    if (
      ip === "::1" || ip === "127.0.0.1" ||
      ip.startsWith("192.168.") || ip.startsWith("10.") ||
      ip.startsWith("172.") || ip === "localhost"
    ) {
      setLocation("This device");
      return;
    }
    setLoading(true);
    fetch(`https://ip-api.com/json/${ip}?fields=city,regionName,country,status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success") {
          const parts = [data.city, data.country].filter(Boolean);
          setLocation(parts.join(", ") || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ip]);

  return { location, loading };
}

/** Format relative time */
function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Redesigned mobile session card */
function SessionCard({
  entry,
  onRevoke,
  revoking,
  compact = false,
}: {
  entry: ActiveSession;
  onRevoke: () => void;
  revoking: boolean;
  compact?: boolean;
}) {
  const device = parseDevice(entry.userAgent);
  const provider = entry.provider === "google" ? "Google" : "Password";
  const { location, loading: locLoading } = useIpLocation(entry.ip);
  const lastActive = timeAgo(entry.updatedAt || entry.createdAt);

  const isLocal =
    !entry.ip ||
    entry.ip === "::1" ||
    entry.ip === "127.0.0.1" ||
    entry.ip.startsWith("192.168.") ||
    entry.ip.startsWith("10.");

  const locationText = isLocal ? "This device" : (location || entry.ip || "Unknown");

  const actionBadge = entry.isCurrent ? (
    <span
      className="flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: "rgba(0,122,255,0.12)", color: "#007AFF" }}
    >
      ● Active now
    </span>
  ) : (
    <button
      type="button"
      onClick={onRevoke}
      disabled={revoking}
      className="flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#FF3B30] transition-opacity disabled:opacity-40 whitespace-nowrap"
      style={{ backgroundColor: "rgba(255,59,48,0.08)" }}
    >
      {revoking
        ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : <Trash2 className="w-3 h-3" />
      }
      Revoke
    </button>
  );

  /* ── Desktop compact single-row layout ── */
  if (compact) {
    return (
      <div
        className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--color-hover)] transition-colors"
        style={{
          borderLeft: entry.isCurrent ? "3px solid #007AFF" : "3px solid transparent",
          backgroundColor: entry.isCurrent ? "rgba(0,122,255,0.025)" : undefined,
          minHeight: "56px",
        }}
      >
        {/* Col 1: Device icon + OS · Browser */}
        <div className="flex items-center gap-2.5 flex-shrink-0" style={{ width: "200px" }}>
          <span
            className="flex-shrink-0 w-8 h-8 rounded-[9px] flex items-center justify-center"
            style={{ backgroundColor: entry.isCurrent ? "rgba(0,122,255,0.1)" : "var(--color-hover)" }}
          >
            <DeviceOsIcon
              device={device}
              className="w-4 h-4"
              style={{ color: entry.isCurrent ? "#007AFF" : undefined }}
            />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-default leading-tight truncate">
              {device.os} · {device.browser}
            </p>
            <p className="text-[11px] text-muted">{device.typeLabel}</p>
          </div>
        </div>

        {/* Col 2: User + email */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-medium text-default truncate">
              {entry.userName || entry.userEmail || "User"}
            </p>
            <span className="flex-shrink-0 text-[10px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-muted">
              {provider}
            </span>
          </div>
          <p className="text-[11px] text-muted truncate">{entry.userEmail || ""}</p>
        </div>

        {/* Col 3: Location + time */}
        <div className="flex-shrink-0 flex flex-col items-end gap-0.5" style={{ width: "160px" }}>
          <span className="flex items-center gap-1 text-[11px] text-faint">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {locLoading
              ? <span className="inline-block w-16 h-2.5 rounded bg-[var(--color-border)] animate-pulse" />
              : <span className="truncate max-w-[130px]">{locationText}</span>
            }
          </span>
          {lastActive && (
            <span className="flex items-center gap-1 text-[11px] text-faint">
              <Clock className="w-3 h-3 flex-shrink-0" />
              {lastActive}
            </span>
          )}
        </div>

        {/* Col 4: Action */}
        <div className="flex-shrink-0 flex items-center justify-end" style={{ width: "96px" }}>
          {actionBadge}
        </div>
      </div>
    );
  }

  /* ── Mobile stacked layout (unchanged) ── */
  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderLeft: entry.isCurrent ? "3px solid #007AFF" : "3px solid transparent",
        backgroundColor: entry.isCurrent ? "rgba(0,122,255,0.03)" : undefined,
      }}
    >
      <div className="px-4 py-3.5">
        {/* Row 1: Device · Browser  +  Current badge or Revoke */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex-shrink-0 w-8 h-8 rounded-[9px] flex items-center justify-center"
              style={{ backgroundColor: entry.isCurrent ? "rgba(0,122,255,0.1)" : "var(--color-hover)" }}
            >
              <DeviceOsIcon
                device={device}
                className="w-4 h-4"
                style={{ color: entry.isCurrent ? "#007AFF" : undefined }}
              />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-default leading-tight">
                {device.os} · {device.browser}
              </p>
              <p className="text-[12px] text-muted mt-0.5">{device.typeLabel}</p>
            </div>
          </div>
          {actionBadge}
        </div>

        {/* Row 2: User name + provider */}
        <div className="flex items-center gap-1.5 mt-2.5">
          <p className="text-[13px] text-default font-medium truncate">
            {entry.userName || entry.userEmail || "User"}
          </p>
          <span className="flex-shrink-0 text-[11px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-muted">
            {provider}
          </span>
        </div>

        {/* Row 3: Email */}
        <p className="text-[12px] text-muted mt-0.5 truncate">{entry.userEmail || ""}</p>

        {/* Row 4: Location + time */}
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-[11px] text-faint">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {locLoading
              ? <span className="inline-block w-20 h-3 rounded bg-[var(--color-border)] animate-pulse" />
              : <span>{locationText}</span>
            }
          </span>
          {lastActive && (
            <span className="flex items-center gap-1 text-[11px] text-faint">
              <Clock className="w-3 h-3 flex-shrink-0" />
              {lastActive}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint px-1">{label}</p>
      )}
      <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] bg-card divide-y divide-[var(--color-border)]">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ManagedUser["status"] }) {
  const classes = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
    pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
    disabled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

type ConfirmState = {
  open: boolean;
  title: string;
  description?: string;
  note?: string;
  onConfirm: () => Promise<void>;
};

const closedConfirm: ConfirmState = { open: false, title: "", onConfirm: async () => {} };

export default function AccessPanel() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as (Session["user"] & { role?: string }) | undefined)?.role === "admin";

  const [userForm, setUserForm] = useState(emptyUserForm);
  const [savingUser, setSavingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(closedConfirm);
  const [passwordModal, setPasswordModal] = useState<{ open: boolean; user: ManagedUser | null }>({ open: false, user: null });
  const [passwordInput, setPasswordInput] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionSheet, setActionSheet] = useState<{ actions: ActionSheetAction[] } | null>(null);
  const [desktopDropdown, setDesktopDropdown] = useState<{ actions: ActionSheetAction[]; anchor: DOMRect } | null>(null);
  const isMobile = useIsMobile();

  const { data: managedUsersData, loading: usersLoading, refetch: refetchManagedUsers } =
    useCache<{ users: ManagedUser[] }>("/api/users", { enabled: isAdmin, initialData: { users: [] } });
  const managedUsers = useMemo(() => isAdmin ? managedUsersData.users : [], [isAdmin, managedUsersData.users]);
  const { setUsers } = useSettingsSearch();
  useEffect(() => {
    if (managedUsers.length > 0) {
      setUsers(managedUsers.map((u) => ({ id: u.id, name: u.name, email: u.email || "", loginId: u.loginId || "" })));
    }
  }, [managedUsers, setUsers]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      await fetch("/api/sessions", { method: "PATCH" }).catch(() => {});
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error || "Failed to load sessions"); return; }
      setSessions(Array.isArray(body) ? body : []);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const refreshAll = () => {
    if (!isAdmin) return;
    invalidate("/api/users", "/api/sessions");
    refetchManagedUsers();
    loadSessions();
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    setSavingUser(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error || "Failed to create user"); return; }
      toast.success("User created");
      setUserForm(emptyUserForm);
      setShowCreateForm(false);
      refreshAll();
    } finally {
      setSavingUser(false);
    }
  };

  const updateUserStatus = (user: ManagedUser, status: ManagedUser["status"]) => {
    const action =
      status === "active"
        ? user.status === "pending" ? "approve this Google request" : "enable this user"
        : status === "disabled" ? "disable this user and revoke sessions"
        : "reject this Google request";

    setConfirmState({
      open: true,
      title: `Confirm: ${action}`,
      description: `Are you sure you want to ${action}?`,
      onConfirm: async () => {
        setUpdatingUserId(user.id);
        try {
          const response = await fetch(`/api/users?id=${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) { toast.error(body?.error || "Failed to update user"); return; }
          toast.success("User updated");
          refreshAll();
        } finally {
          setUpdatingUserId(null);
          setConfirmState(closedConfirm);
        }
      },
    });
  };

  const updateGoogleStatus = (user: ManagedUser, googleStatus: ManagedUser["googleStatus"]) => {
    const action =
      googleStatus === "approved" ? "approve Google login for this user"
      : googleStatus === "rejected" ? "reject Google login for this user"
      : "clear Google login access for this user";

    setConfirmState({
      open: true,
      title: `Confirm: ${action}`,
      onConfirm: async () => {
        setUpdatingUserId(user.id);
        try {
          const response = await fetch(`/api/users?id=${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ googleStatus }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) { toast.error(body?.error || "Failed to update Google access"); return; }
          toast.success("Google access updated");
          refreshAll();
        } finally {
          setUpdatingUserId(null);
          setConfirmState(closedConfirm);
        }
      },
    });
  };

  const openResetPassword = (user: ManagedUser) => {
    setPasswordInput("");
    setPasswordModal({ open: true, user });
  };

  const submitResetPassword = async () => {
    if (!passwordModal.user || !passwordInput.trim()) return;
    const user = passwordModal.user;
    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users?id=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error || "Failed to reset password"); return; }
      toast.success("Password updated");
      setPasswordModal({ open: false, user: null });
      refreshAll();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const deleteUser = (user: ManagedUser) => {
    setConfirmState({
      open: true,
      title: `Delete ${user.name}?`,
      description: "This action cannot be undone.",
      note: "All their active sessions will also be revoked.",
      onConfirm: async () => {
        setUpdatingUserId(user.id);
        try {
          const response = await fetch(`/api/users?id=${user.id}`, { method: "DELETE" });
          const body = await response.json().catch(() => null);
          if (!response.ok) { toast.error(body?.error || "Failed to delete user"); return; }
          toast.success("User deleted");
          refreshAll();
        } finally {
          setUpdatingUserId(null);
          setConfirmState(closedConfirm);
        }
      },
    });
  };

  const revokeSession = (sessionId: string) => {
    setConfirmState({
      open: true,
      title: "Revoke this session?",
      description: "That browser will need to sign in again.",
      onConfirm: async () => {
        setRevokingSessionId(sessionId);
        try {
          const response = await fetch("/api/sessions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: sessionId }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) { toast.error(body?.error || "Failed to revoke session"); return; }
          toast.success("Session revoked");
          loadSessions();
        } finally {
          setRevokingSessionId(null);
          setConfirmState(closedConfirm);
        }
      },
    });
  };

  /** Open the iOS-style action sheet for a user */
  const openUserActions = (entry: ManagedUser, _anchorRect: DOMRect) => {
    const actions: ActionSheetAction[] = [];

    if (entry.googleStatus === "pending") {
      actions.push({
        label: "Approve Google",
        icon: <CheckCircle2 className="w-5 h-5" />,
        onClick: () => updateGoogleStatus(entry, "approved"),
      });
      actions.push({
        label: "Reject Google",
        icon: <XCircle className="w-5 h-5" />,
        danger: true,
        onClick: () => updateGoogleStatus(entry, "rejected"),
      });
    }

    if (entry.status === "active") {
      actions.push({
        label: "Disable User",
        icon: <PowerOff className="w-5 h-5" />,
        danger: true,
        onClick: () => updateUserStatus(entry, "disabled"),
      });
    } else if (entry.status !== "pending") {
      actions.push({
        label: "Enable User",
        icon: <Power className="w-5 h-5" />,
        onClick: () => updateUserStatus(entry, "active"),
      });
    }

    if (entry.hasPasswordLogin) {
      actions.push({
        label: "Reset Password",
        icon: <KeyRound className="w-5 h-5" />,
        onClick: () => openResetPassword(entry),
      });
    }

    actions.push({
      label: "Delete User",
      icon: <Trash2 className="w-5 h-5" />,
      danger: true,
      onClick: () => deleteUser(entry),
    });

    if (isMobile) {
      setActionSheet({ actions });
    } else {
      // Desktop: use the anchor rect captured at call time
      setDesktopDropdown({ actions, anchor: _anchorRect });
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-IN");
  };

  const loginMethodLabel = (m: ManagedUser["loginMethod"]) =>
    m === "both" ? "Password + Google" : m === "google" ? "Google" : "Password";

  return (
    <div className="space-y-5">

      {/* Users section */}
      {!isAdmin ? (
        <SettingsGroup label="User Access">
          <div className="px-4 py-8 text-center text-sm text-muted">
            You need admin access to manage users.
          </div>
        </SettingsGroup>
      ) : (
        <>
          <SettingsGroup label="Users">
            {usersLoading ? (
              <div className="px-4 py-4 text-sm text-muted">Loading users…</div>
            ) : managedUsers.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted">No users yet.</div>
            ) : (
              managedUsers.map((entry) => {
                const isBusy = updatingUserId === entry.id;
                return (
                  <div key={entry.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {/* Name + badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[15px] font-semibold text-default">{entry.name}</p>
                          <StatusBadge status={entry.status} />
                          {entry.role === "admin" && (
                            <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/25 dark:border-brand-900/50 dark:text-brand-300">
                              Admin
                            </span>
                          )}
                          {entry.googleStatus !== "none" && (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              entry.googleStatus === "approved"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300"
                                : entry.googleStatus === "pending"
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300"
                                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300"
                            }`}>
                              Google {entry.googleStatus}
                            </span>
                          )}
                        </div>
                        {/* Login info */}
                        <p className="text-xs text-muted mt-0.5 truncate">
                          {entry.loginId || entry.email || "—"} · {loginMethodLabel(entry.loginMethod)}
                        </p>
                        {entry.lastLoginAt && (
                          <p className="text-xs text-faint mt-0.5">
                            Last login {formatDate(entry.lastLoginAt)}
                          </p>
                        )}
                      </div>

                      {/* ··· action button — replaces all the inline buttons */}
                      <button
                        type="button"
                        onClick={(e) => openUserActions(entry, (e.currentTarget as HTMLButtonElement).getBoundingClientRect())}
                        disabled={isBusy}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-hover)] text-faint transition-colors disabled:opacity-40"
                      >
                        {isBusy
                          ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          : <MoreHorizontal className="w-5 h-5" />
                        }
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Add user row */}
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-[#007AFF] hover:bg-[var(--color-hover)] transition-colors"
            >
              <span className="w-8 h-8 rounded-[9px] bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </span>
              <span className="flex-1 text-left text-[15px] font-medium">Add new user</span>
              <ChevronRight className={`w-4 h-4 text-faint transition-transform ${showCreateForm ? "rotate-90" : ""}`} />
            </button>
          </SettingsGroup>

          {/* Create form */}
          {showCreateForm && (
            <SettingsGroup label="New User">
              <form onSubmit={saveUser} className="px-4 py-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-faint uppercase tracking-wide">Login Type</label>
                  <select
                    className="mt-1 w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition"
                    value={userForm.loginMethod}
                    onChange={(e) => setUserForm((c) => ({ ...c, loginMethod: e.target.value as "password" | "google" }))}
                  >
                    <option value="password">ID + Password</option>
                    <option value="google">Google Email</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-faint uppercase tracking-wide">Name *</label>
                  <input className="mt-1 w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition"
                    value={userForm.name} onChange={(e) => setUserForm((c) => ({ ...c, name: e.target.value }))}
                    placeholder="Team Member" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-faint uppercase tracking-wide">
                    {userForm.loginMethod === "google" ? "Email *" : "Login ID *"}
                  </label>
                  <input className="mt-1 w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition"
                    value={userForm.loginMethod === "google" ? userForm.email : userForm.loginId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setUserForm((c) => c.loginMethod === "google" ? { ...c, email: value } : { ...c, loginId: value });
                    }}
                    placeholder={userForm.loginMethod === "google" ? "person@example.com" : "accounts-team"}
                    required />
                </div>
                {userForm.loginMethod === "password" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-faint uppercase tracking-wide">Password *</label>
                      <input className="mt-1 w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition"
                        type="password" value={userForm.password}
                        onChange={(e) => setUserForm((c) => ({ ...c, password: e.target.value }))}
                        placeholder="Required" required autoComplete="new-password" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-faint uppercase tracking-wide">Email (optional)</label>
                      <input className="mt-1 w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition"
                        type="email" value={userForm.email}
                        onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))}
                        placeholder="Optional" />
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={savingUser}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-40">
                    <UserPlus className="w-4 h-4" />
                    {savingUser ? "Creating…" : "Create User"}
                  </button>
                  <button type="button" onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium text-default hover:bg-[var(--color-hover)] transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </SettingsGroup>
          )}
        </>
      )}

      {/* Active Sessions */}
      <SettingsGroup label="Active Sessions">
        {/* Header row — icon label + icon-only refresh button */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-500" />
            <span className="text-[15px] font-medium text-default">Signed-in browsers</span>
          </div>
          <button
            type="button"
            onClick={loadSessions}
            disabled={sessionsLoading}
            title="Refresh sessions"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-hover)] text-faint transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${sessionsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {sessionsLoading && sessions.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">No active sessions found.</div>
        ) : (
          sessions.map((entry) => (
            <React.Fragment key={entry.id}>
              {/* Desktop: compact single-row */}
              <div className="hidden md:block">
                <SessionCard
                  entry={entry}
                  onRevoke={() => revokeSession(entry.id)}
                  revoking={revokingSessionId === entry.id}
                  compact
                />
              </div>
              {/* Mobile: stacked layout */}
              <div className="md:hidden">
                <SessionCard
                  entry={entry}
                  onRevoke={() => revokeSession(entry.id)}
                  revoking={revokingSessionId === entry.id}
                />
              </div>
            </React.Fragment>
          ))
        )}
      </SettingsGroup>

      {/* iOS Action Sheet — mobile only */}
      {actionSheet && (
        <ActionSheet
          actions={actionSheet.actions}
          onClose={() => setActionSheet(null)}
        />
      )}

      {/* Desktop dropdown — shown when 3-dot is clicked on desktop */}
      {desktopDropdown && (
        <DesktopDropdown
          actions={desktopDropdown.actions}
          anchor={desktopDropdown.anchor}
          onClose={() => setDesktopDropdown(null)}
        />
      )}

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        note={confirmState.note}
        confirmLabel="Confirm"
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState(closedConfirm)}
      />

      {/* Password reset modal */}
      {passwordModal.open && passwordModal.user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: "blur(4px)", backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={(e) => e.target === e.currentTarget && setPasswordModal({ open: false, user: null })}
        >
          <div className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden bg-card border-[var(--color-border)]">
            <div className="p-5 space-y-3">
              <h3 className="font-semibold text-default text-sm">Reset password for {passwordModal.user.name}</h3>
              <input
                className="w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="New password"
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={submitResetPassword}
                disabled={!passwordInput.trim() || !!updatingUserId}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-[#007AFF] hover:bg-blue-600 text-white disabled:opacity-40 transition-colors"
              >
                {updatingUserId ? "Saving…" : "Update Password"}
              </button>
              <button
                type="button"
                onClick={() => setPasswordModal({ open: false, user: null })}
                className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border border-[var(--color-border)] bg-card text-default hover:bg-[var(--color-hover)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
