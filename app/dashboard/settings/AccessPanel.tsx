"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import toast from "react-hot-toast";
import {
  UserPlus, Shield, RefreshCw, Trash2, Power, PowerOff,
  CheckCircle2, XCircle, KeyRound, ChevronRight,
} from "lucide-react";
import { invalidate, useCache } from "@/lib/useCache";
import { parseDevice, type ParsedDevice } from "@/lib/device";
import { DeviceOsIcon, BrowserBrandIcon } from "@/components/ui/DeviceBrandIcon";
import { Wifi } from "lucide-react";
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

const emptyUserForm = {
  name: "",
  loginId: "",
  email: "",
  password: "",
  loginMethod: "password" as "password" | "google",
};

function formatIpAddress(ip?: string | null) {
  if (!ip) return "";
  if (ip === "::1" || ip === "127.0.0.1") return `Localhost (${ip})`;
  return ip;
}

function SessionDeviceChips({ device, ip }: { device: ParsedDevice; ip?: string | null }) {
  const formattedIp = formatIpAddress(ip);
  const chipClass = "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-muted";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className={chipClass}>
        <DeviceOsIcon device={device} className="w-3.5 h-3.5 text-sky-500" />
        {device.os} {device.typeLabel}
      </span>
      <span className={chipClass}>
        <BrowserBrandIcon browser={device.browser} className="w-3.5 h-3.5 text-emerald-500" />
        {device.browser}
      </span>
      {formattedIp && (
        <span className={chipClass}>
          <Wifi className="w-3.5 h-3.5 text-amber-500" />
          {formattedIp}
        </span>
      )}
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

  const { data: managedUsersData, loading: usersLoading, refetch: refetchManagedUsers } =
    useCache<{ users: ManagedUser[] }>("/api/users", { enabled: isAdmin, initialData: { users: [] } });
  const managedUsers = isAdmin ? managedUsersData.users : [];

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
                  <div key={entry.id} className="px-4 py-3">
                    {/* User header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-semibold text-default">{entry.name}</p>
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
                        <p className="text-xs text-muted mt-0.5">
                          {entry.loginId || entry.email || "—"} · {loginMethodLabel(entry.loginMethod)}
                        </p>
                        {entry.lastLoginAt && (
                          <p className="text-xs text-faint mt-0.5">
                            Last login {formatDate(entry.lastLoginAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {entry.googleStatus === "pending" && (
                        <>
                          <button type="button" onClick={() => updateGoogleStatus(entry, "approved")} disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-40 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button type="button" onClick={() => updateGoogleStatus(entry, "rejected")} disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-40 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {entry.status === "active" ? (
                        <button type="button" onClick={() => updateUserStatus(entry, "disabled")} disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[#FF3B30] hover:bg-[var(--color-hover)] transition-colors disabled:opacity-40">
                          <PowerOff className="w-3.5 h-3.5" /> Disable
                        </button>
                      ) : entry.status !== "pending" ? (
                        <button type="button" onClick={() => updateUserStatus(entry, "active")} disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-[var(--color-hover)] transition-colors disabled:opacity-40">
                          <Power className="w-3.5 h-3.5" /> Enable
                        </button>
                      ) : null}
                      {entry.hasPasswordLogin && (
                        <button type="button" onClick={() => openResetPassword(entry)} disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-default hover:bg-[var(--color-hover)] transition-colors disabled:opacity-40">
                          <KeyRound className="w-3.5 h-3.5" /> Password
                        </button>
                      )}
                      <button type="button" onClick={() => deleteUser(entry)} disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[#FF3B30] hover:bg-[var(--color-hover)] transition-colors disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
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
              <span className="flex-1 text-left text-sm font-medium">Add new user</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                </div>
                {userForm.loginMethod === "password" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </div>
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-500" />
            <span className="text-sm font-medium text-default">Signed-in browsers</span>
          </div>
          <button type="button" onClick={loadSessions} disabled={sessionsLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-default hover:bg-[var(--color-hover)] transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {sessionsLoading && sessions.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">No active sessions found.</div>
        ) : (
          sessions.map((entry) => {
            const device = parseDevice(entry.userAgent);
            const provider = entry.provider === "google" ? "Google" : "Password";
            return (
              <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-default">{entry.userName || entry.userEmail || "User"}</p>
                    {entry.isCurrent && (
                      <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/25 dark:border-brand-900/50 dark:text-brand-300">
                        Current
                      </span>
                    )}
                    <span className="text-[11px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-muted">
                      {provider}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">{entry.userEmail || "No email"}</p>
                  <SessionDeviceChips device={device} ip={entry.ip} />
                </div>
                <button
                  type="button"
                  onClick={() => revokeSession(entry.id)}
                  disabled={entry.isCurrent || revokingSessionId === entry.id}
                  title={entry.isCurrent ? "Sign out from the top bar to end this session" : "Revoke session"}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                    entry.isCurrent
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-muted cursor-not-allowed"
                      : "border-red-200 bg-red-50 text-[#FF3B30] hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {revokingSessionId === entry.id ? "Revoking…" : entry.isCurrent ? "Current" : "Revoke"}
                </button>
              </div>
            );
          })
        )}
      </SettingsGroup>

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
