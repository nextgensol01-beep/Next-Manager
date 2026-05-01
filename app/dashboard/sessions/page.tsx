"use client";
import { useState, useCallback } from "react";
import { Monitor, Smartphone, Globe, Shield, Trash2, RefreshCw, LogOut, Chrome } from "lucide-react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import { useCache, invalidate } from "@/lib/useCache";
import { formatDistanceToNow, format } from "date-fns";

interface SessionRecord {
  id: string;
  userEmail: string;
  userName: string;
  provider: "credentials" | "google";
  userAgent: string;
  ip: string;
  expires: string;
  createdAt: string;
  isCurrent: boolean;
}

function parseDevice(userAgent: string): { label: string; icon: React.ReactNode } {
  if (!userAgent) return { label: "Unknown device", icon: <Globe className="w-4 h-4" /> };
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return { label: "Mobile browser", icon: <Smartphone className="w-4 h-4" /> };
  }
  if (ua.includes("chrome")) return { label: "Chrome", icon: <Chrome className="w-4 h-4" /> };
  if (ua.includes("firefox")) return { label: "Firefox", icon: <Monitor className="w-4 h-4" /> };
  if (ua.includes("safari")) return { label: "Safari", icon: <Monitor className="w-4 h-4" /> };
  return { label: "Desktop browser", icon: <Monitor className="w-4 h-4" /> };
}

export default function SessionsPage() {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const { data, loading, refetch } = useCache<{ sessions: SessionRecord[] }>(
    "/api/sessions",
    { initialData: { sessions: [] } }
  );

  // Register the current session's UA + IP on first load
  useState(() => {
    fetch("/api/sessions", { method: "PATCH" }).catch(() => {});
  });

  const sessions = data?.sessions ?? [];
  const activeSessions = sessions.filter((s) => new Date(s.expires) > new Date());

  const revokeSession = useCallback(async (id: string, isCurrent: boolean) => {
    if (isCurrent) {
      if (!confirm("This will revoke your current session and log you out. Continue?")) return;
    }
    setRevoking(id);
    try {
      const res = await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Session revoked");
      invalidate("/api/sessions");
      refetch();
      if (isCurrent) {
        // Sign out after revoking own session
        setTimeout(() => { window.location.href = "/api/auth/signout"; }, 800);
      }
    } catch {
      toast.error("Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  }, [refetch]);

  const revokeAll = useCallback(async () => {
    const otherCount = activeSessions.filter((s) => !s.isCurrent).length;
    if (otherCount === 0) {
      toast("No other sessions to revoke");
      return;
    }
    if (!confirm(`Revoke all ${otherCount} other active session(s)? Those users will be logged out.`)) return;
    setRevokingAll(true);
    try {
      const res = await fetch("/api/sessions?all=1", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      const body = await res.json();
      toast.success(`Revoked ${body.deleted} session(s)`);
      invalidate("/api/sessions");
      refetch();
    } catch {
      toast.error("Failed to revoke sessions");
    } finally {
      setRevokingAll(false);
    }
  }, [activeSessions, refetch]);

  const otherSessionCount = activeSessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Sessions"
        description="See who is currently logged in and revoke access if needed"
      />

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-base shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/25 dark:text-brand-300 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-default">{activeSessions.length}</p>
            <p className="text-xs text-muted">Active sessions</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-base shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300 flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-default">{otherSessionCount}</p>
            <p className="text-xs text-muted">Other sessions</p>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-card rounded-2xl border border-base shadow-sm p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Revoke all other sessions at once</p>
          <button
            type="button"
            onClick={revokeAll}
            disabled={revokingAll || otherSessionCount === 0}
            className="glass-pill"
            style={{ color: otherSessionCount > 0 ? "#dc2626" : undefined, whiteSpace: "nowrap" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            {revokingAll ? "Revoking..." : "Revoke all others"}
          </button>
        </div>
      </div>

      {/* Session list */}
      <section className="bg-card rounded-2xl border border-base shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-default">Sessions</h2>
          <button
            type="button"
            onClick={() => { invalidate("/api/sessions"); refetch(); }}
            className="glass-pill"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && activeSessions.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">Loading sessions...</p>
        ) : activeSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-base px-4 py-8 text-sm text-muted text-center">
            No active sessions found.
          </div>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((s) => {
              const device = parseDevice(s.userAgent);
              const loginedAgo = formatDistanceToNow(new Date(s.createdAt), { addSuffix: true });
              const expiresAt = format(new Date(s.expires), "dd MMM yyyy, HH:mm");
              const isRevokingThis = revoking === s.id;

              return (
                <div
                  key={s.id}
                  className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    s.isCurrent
                      ? "border-brand-300 bg-brand-50/50 dark:border-brand-700 dark:bg-brand-900/10"
                      : "border-base bg-surface/50"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      s.isCurrent
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : "bg-card text-muted border border-base"
                    }`}>
                      {device.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-default">{s.userName || s.userEmail}</p>
                        {s.isCurrent && (
                          <span className="text-[11px] rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-200 dark:border-brand-700 px-2 py-0.5 font-medium">
                            This session
                          </span>
                        )}
                        <span className={`text-[11px] rounded-full border px-2 py-0.5 ${
                          s.provider === "google"
                            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
                            : "bg-card text-muted border-base"
                        }`}>
                          {s.provider === "google" ? "Google" : "Password"}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{s.userEmail}</p>
                      <p className="text-xs text-faint mt-0.5">
                        {device.label}
                        {s.ip ? ` · ${s.ip}` : ""}
                        {" · "} Logged in {loginedAgo}
                        {" · "} Expires {expiresAt}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => revokeSession(s.id, s.isCurrent)}
                    disabled={isRevokingThis}
                    className="glass-pill flex-shrink-0"
                    style={{ color: "#dc2626" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isRevokingThis ? "Revoking..." : s.isCurrent ? "Log out" : "Revoke"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Info box */}
      <div className="bg-card rounded-2xl border border-base shadow-sm p-5">
        <p className="text-xs uppercase tracking-wide text-faint mb-3">How Sessions Work</p>
        <div className="space-y-2 text-sm text-muted">
          <p>Each login creates a session that lasts 30 days. Revoking a session forces that browser to log in again.</p>
          <p>Sessions are automatically removed when they expire or when a user signs out normally.</p>
          <p>Browser/device info is detected from the login request but may not always be accurate.</p>
        </div>
      </div>
    </div>
  );
}
