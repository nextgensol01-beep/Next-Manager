"use client";
import React, { useState, useMemo } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import { Trash2, RefreshCw, Inbox, ChevronDown, Search } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";

interface EmailLog {
  _id: string;
  type: string;
  to: string[];
  subject: string;
  clientName: string;
  financialYear: string;
  sentAt: string;
  status: string;
  notes?: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  quotation:           { label: "Quotation",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  payment_reminder:    { label: "Reminder",   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  annual_return_draft: { label: "AR Draft",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  custom:              { label: "Custom",     color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EmailHistoryPage() {
  const [typeFilter, setTypeFilter]   = useState("all");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [deleting, setDeleting]       = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [search, setSearch]             = useState("");

  const logsUrl = `/api/email-log${typeFilter !== "all" ? `?type=${typeFilter}` : ""}`;
  const { data: rawLogs, loading, refetch } = useCache<EmailLog[]>(logsUrl);
  const logs = useMemo(() => (Array.isArray(rawLogs) ? rawLogs : []), [rawLogs]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(selected.size === logs.length ? new Set() : new Set(logs.map(l => l._id)));

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected log${selected.size !== 1 ? "s" : ""}?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/email-log?ids=${Array.from(selected).join(",")}`, { method: "DELETE" });
      toast.success(`Deleted ${selected.size} log${selected.size !== 1 ? "s" : ""}`);
      invalidate("/api/email-log"); refetch();
    } finally { setDeleting(false); }
  };

  const deleteOne = async (id: string) => {
    if (!confirm("Delete this email log?")) return;
    await fetch(`/api/email-log?ids=${id}`, { method: "DELETE" });
    toast.success("Log deleted");
    invalidate("/api/email-log"); refetch();
  };

  const clearAll = async () => {
    const label = typeFilter === "all" ? "ALL email history" : `all ${TYPE_LABELS[typeFilter]?.label || typeFilter} logs`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const params = new URLSearchParams({ all: "true" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      await fetch(`/api/email-log?${params}`, { method: "DELETE" });
      toast.success("Email history cleared");
      invalidate("/api/email-log"); refetch();
    } finally { setDeleting(false); }
  };

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.subject.toLowerCase().includes(q) ||
        l.clientName?.toLowerCase().includes(q) ||
        l.to.some((e) => e.toLowerCase().includes(q)) ||
        l.financialYear?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  // Summary counts
  const counts = logs.reduce((acc, l) => {
    acc[l.type] = (acc[l.type] || 0) + 1;
    acc._total = (acc._total || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <PageHeader title="Email History" description="All emails sent and drafts created from this system" />

      {/* Summary chips + actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="glass-tray">
          {[
            { key: "all",                label: "All",       count: counts._total || 0 },
            { key: "quotation",          label: "Quotations",count: counts.quotation || 0 },
            { key: "payment_reminder",   label: "Reminders", count: counts.payment_reminder || 0 },
            { key: "annual_return_draft",label: "AR Drafts", count: counts.annual_return_draft || 0 },
            { key: "custom",             label: "Custom",    count: counts.custom || 0 },
          ].map(({ key, label, count }) => (
            <button key={key} onClick={() => setTypeFilter(key)}
              className={`glass-pill ${typeFilter === key ? "glass-pill-active" : ""}`}>
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${
                typeFilter === key ? "bg-white/20 text-white" : "bg-black/8 text-faint"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <div className="glass-tray">
            {selected.size > 0 && (
              <button onClick={deleteSelected} disabled={deleting}
                className="glass-pill" style={{ color: "#ff3b30" }}>
                <Trash2 className="w-3.5 h-3.5" />Delete {selected.size} selected
              </button>
            )}
            <button onClick={clearAll} disabled={deleting || logs.length === 0}
              className="glass-pill">
              <Trash2 className="w-3.5 h-3.5" />Clear {typeFilter === "all" ? "All" : TYPE_LABELS[typeFilter]?.label}
            </button>
            <button onClick={refetch} disabled={loading}
              className="glass-pill">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex items-center gap-2 transition-colors">
        <Search className="w-4 h-4 text-faint flex-shrink-0 ml-1" />
        <input
          className="bg-transparent border-0 ring-0 outline-none flex-1 py-1.5 text-sm text-default placeholder:text-faint"
          placeholder="Search by subject, client, recipient, or FY…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-faint hover:text-default px-2 py-0.5 rounded transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors hidden lg:block">
        {loading ? (
          <LoadingSpinner />
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Inbox className="w-7 h-7 text-faint" />
            </div>
            <p className="font-semibold text-default">No emails logged yet</p>
            <p className="text-sm text-faint mt-1">Sent reminders, quotations, and AR drafts will appear here</p>
          </div>
        ) : (
          <TableWrapper><table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="table-header w-10 text-center">
                  <input type="checkbox" className="rounded"
                    checked={selected.size === logs.length && logs.length > 0}
                    onChange={toggleAll} />
                </th>
                <th className="table-header">Type</th>
                <th className="table-header">Recipients</th>
                <th className="table-header">Subject</th>
                <th className="table-header">Client</th>
                <th className="table-header">FY</th>
                <th className="table-header">Status</th>
                <th className="table-header">Sent</th>
                <th className="table-header w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const tl = TYPE_LABELS[log.type] || { label: log.type, color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" };
                const isSelected = selected.has(log._id);
                const isExpanded = expandedId === log._id;
                return (
                  <React.Fragment key={log._id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : log._id)}
                      className={`border-t border-soft cursor-pointer transition-colors ${isSelected ? "bg-brand-50 dark:bg-brand-900/10" : "hover:bg-hover"}`}>
                      <td className="table-cell text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="rounded" checked={isSelected} onChange={() => toggleSelect(log._id)} />
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${tl.color}`}>
                          {tl.label}
                        </span>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {log.to.slice(0, 2).map((e) => (
                            <span key={e} className="text-xs text-muted truncate max-w-[180px]" title={e}>{e}</span>
                          ))}
                          {log.to.length > 2 && <span className="text-xs text-faint">+{log.to.length - 2} more</span>}
                        </div>
                      </td>
                      <td className="table-cell text-sm text-default max-w-[220px] truncate" title={log.subject}>{log.subject}</td>
                      <td className="table-cell text-sm text-muted">{log.clientName || "—"}</td>
                      <td className="table-cell text-xs font-mono text-muted">{log.financialYear || "—"}</td>
                      <td className="table-cell whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          log.status === "sent"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : log.status === "draft"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {log.status === "sent" ? "✓ Sent" : log.status === "draft" ? "✎ Draft" : "✗ Failed"}
                        </span>
                      </td>
                      <td className="table-cell text-xs text-faint">
                        <span>{timeAgo(log.sentAt)}</span>
                        <span className="block opacity-60">{fmtDate(log.sentAt)}</span>
                      </td>
                      <td className="table-cell whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button onClick={() => deleteOne(log._id)}
                          className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {/* Expanded notes row */}
                    {isExpanded && (
                      <tr className="border-t border-soft bg-surface">
                        <td colSpan={9} className="px-6 py-3">
                          <div className="flex gap-6 text-xs text-muted">
                            <span><strong className="text-default">All Recipients:</strong> {log.to.join(", ") || "—"}</span>
                            {log.notes && <span><strong className="text-default">Notes:</strong> {log.notes}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table></TableWrapper>
        )}
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="lg:hidden space-y-2">
        {loading ? <LoadingSpinner /> : logs.length === 0 ? (
          <div className="bg-card border border-base rounded-2xl p-8 text-center shadow-sm">
            <Inbox className="w-8 h-8 text-faint mx-auto mb-2" />
            <p className="font-semibold text-default">No emails logged yet</p>
          </div>
        ) : filteredLogs.map((log) => {
          const tl = TYPE_LABELS[log.type] || { label: log.type, color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" };
          const isExpanded = expandedId === log._id;
          const isSelected = selected.has(log._id);
          return (
            <div key={log._id} className={`bg-card border rounded-2xl shadow-sm overflow-hidden transition-colors ${isSelected ? "border-brand-400" : "border-base"}`}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => setExpandedId(isExpanded ? null : log._id)}>
                <input type="checkbox" className="rounded flex-shrink-0" checked={isSelected} onChange={() => toggleSelect(log._id)} onClick={e => e.stopPropagation()} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full ${tl.color}`}>{tl.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      log.status === "sent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : log.status === "draft" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                      {log.status === "sent" ? "✓ Sent" : log.status === "draft" ? "✎ Draft" : "✗ Failed"}
                    </span>
                  </div>
                  <p className="text-sm text-default truncate font-medium">{log.subject}</p>
                  <p className="text-xs text-faint">{log.clientName || "—"} · {timeAgo(log.sentAt)}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
              {isExpanded && (
                <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-2">
                  <div className="text-xs space-y-1">
                    <div><span className="text-faint">To: </span><span className="text-default">{log.to.join(", ")}</span></div>
                    {log.financialYear && <div><span className="text-faint">FY: </span><span className="text-default font-mono">{log.financialYear}</span></div>}
                    {log.notes && <div><span className="text-faint">Notes: </span><span className="text-default">{log.notes}</span></div>}
                    <div><span className="text-faint">Sent: </span><span className="text-default">{fmtDate(log.sentAt)}</span></div>
                  </div>
                  <button onClick={() => deleteOne(log._id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredLogs.length > 0 && (
        <p className="text-xs text-faint text-center mt-3">
          {filteredLogs.length}{filteredLogs.length !== logs.length ? ` of ${logs.length}` : ""} record{filteredLogs.length !== 1 ? "s" : ""}{selected.size > 0 ? ` · ${selected.size} selected` : ""}
          {" · "}Click any row to expand details
        </p>
      )}
    </div>
  );
}
