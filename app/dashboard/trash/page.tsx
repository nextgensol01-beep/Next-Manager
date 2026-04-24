"use client";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import { Trash2, RotateCcw, AlertTriangle, Search, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useCache, invalidate } from "@/lib/useCache";

interface TrashItem {
  _id: string;
  recordType: string;
  label: string;
  subLabel?: string;
  deletedAt: string;
}

const TYPE_API_MAP: Record<string, string[]> = {
  client:            ["/api/clients"],
  contact:           ["/api/contacts"],
  creditTransaction: ["/api/credit-transactions", "/api/financial-year"],
  financialYear:     ["/api/financial-year"],
  billing:           ["/api/billing", "/api/payments"],
  payment:           ["/api/payments", "/api/billing"],
  annualReturn:      ["/api/annual-return"],
  uploadRecord:      ["/api/upload-records"],
  invoice:           ["/api/invoices"],
};

const TYPE_LABELS: Record<string, string> = {
  client: "Client", contact: "Contact", creditTransaction: "Transaction",
  financialYear: "FY Record", billing: "Billing", payment: "Payment",
  annualReturn: "Annual Return", uploadRecord: "Upload Record", invoice: "Invoice",
};

const TYPE_COLORS: Record<string, string> = {
  client:            "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  contact:           "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  creditTransaction: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  financialYear:     "bg-green-500/10 text-green-600 dark:text-green-400",
  billing:           "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  payment:           "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  annualReturn:      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  uploadRecord:      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  invoice:           "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  if (weeks  > 0) return `${weeks}w ago`;
  if (days   > 0) return `${days}d ago`;
  if (hours  > 0) return `${hours}h ago`;
  if (mins   > 0) return `${mins}m ago`;
  return "just now";
}

function daysLeft(iso: string) {
  const deleted = new Date(iso).getTime();
  const purgeAt = deleted + 90 * 24 * 60 * 60 * 1000;
  const days = Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

function PurgeBar({ deletedAt }: { deletedAt: string }) {
  const left = daysLeft(deletedAt);
  const pct  = Math.round((left / 90) * 100);
  const color = left > 30 ? "bg-emerald-500" : left > 10 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="hidden sm:flex flex-col items-end">
        <span className="text-xs font-medium text-faint">{timeAgo(deletedAt)}</span>
        <span className={`text-[10px] font-semibold ${left <= 10 ? "text-red-500" : left <= 30 ? "text-amber-500" : "text-faint"}`}>
          {left}d left
        </span>
      </div>
      <div className="hidden md:block w-16">
        <div className="w-full bg-surface rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function TrashPage() {
  const searchParams = useSearchParams();
  const [typeFilter, setTypeFilter]   = useState(() => searchParams.get("type") || "all");
  const [search, setSearch]           = useState(() => searchParams.get("search") || "");
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useEffect(() => {
    const nextType = searchParams.get("type") || "all";
    const nextSearch = searchParams.get("search") || "";
    setTypeFilter(nextType);
    setSearch(nextSearch);
  }, [searchParams]);

  const { data: rawItems, loading, refetch } = useCache<TrashItem[]>(`/api/trash?type=${typeFilter}`);
  const items = useMemo(() => (Array.isArray(rawItems) ? rawItems : []), [rawItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || (i.subLabel || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const restore = async (item: TrashItem) => {
    const r = await fetch(`/api/trash/${item._id}`, { method: "POST" });
    if (!r.ok) { const d = await r.json(); toast.error(d.error || "Restore failed"); return; }
    toast.success(`"${item.label}" restored!`);
    invalidate("/api/trash", ...(TYPE_API_MAP[item.recordType] || []));
    refetch();
  };

  const deletePermanently = async (item: TrashItem) => {
    if (!confirm(`Permanently delete "${item.label}"? This cannot be undone.`)) return;
    await fetch(`/api/trash/${item._id}`, { method: "DELETE" });
    toast.success("Permanently deleted");
    invalidate("/api/trash"); refetch();
  };

  const emptyTrash = async () => {
    await fetch("/api/trash/empty", { method: "DELETE" });
    toast.success("Trash emptied");
    setConfirmEmpty(false);
    invalidate("/api/trash"); refetch();
  };

  const typeCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.recordType] = (acc[item.recordType] || 0) + 1;
    return acc;
  }, {});
  const allTypes = Object.keys(TYPE_LABELS);

  const ItemRow = ({ item }: { item: TrashItem }) => (
    <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-hover transition-colors">
      <div className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${TYPE_COLORS[item.recordType] || "bg-surface text-muted"}`}>
        {TYPE_LABELS[item.recordType] || item.recordType}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-default truncate">{item.label}</p>
        {item.subLabel && <p className="text-xs text-muted truncate">{item.subLabel}</p>}
        {/* Mobile: show time info inline */}
        <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
          <Clock className="w-3 h-3 text-faint" />
          <span className="text-xs text-faint">{timeAgo(item.deletedAt)}</span>
          <span className="text-xs text-faint">·</span>
          <span className={`text-xs font-medium ${daysLeft(item.deletedAt) <= 10 ? "text-red-500" : daysLeft(item.deletedAt) <= 30 ? "text-amber-500" : "text-faint"}`}>
            {daysLeft(item.deletedAt)}d left
          </span>
        </div>
      </div>
      <PurgeBar deletedAt={item.deletedAt} />
      <div className="flex gap-1 shrink-0">
        <button onClick={() => restore(item)} title="Restore"
          className="p-1.5 sm:p-2 text-faint hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button onClick={() => deletePermanently(item)} title="Delete permanently"
          className="p-1.5 sm:p-2 text-faint hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Recycle Bin" description="Deleted records — auto-purged after 90 days">
        {items.length > 0 && (
          confirmEmpty ? (
            <div className="glass-tray">
              <span className="text-xs font-semibold" style={{ color: "#ff3b30", padding: "0 4px" }}>Are you sure?</span>
              <button onClick={emptyTrash} className="glass-pill" style={{ color: "#ff3b30" }}>Yes, empty all</button>
              <button onClick={() => setConfirmEmpty(false)} className="glass-pill">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmEmpty(true)} className="glass-btn" style={{ color: "#ff3b30" }}>
              <Trash2 className="w-3.5 h-3.5" /> Empty Trash
            </button>
          )
        )}
      </PageHeader>

      {/* Search + filter bar */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex flex-col sm:flex-row gap-3 transition-colors">
        <div className="flex items-center gap-2 flex-1 bg-surface rounded-xl px-3">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input
            className="bg-transparent border-0 ring-0 outline-none flex-1 py-2 text-sm text-default placeholder:text-faint"
            placeholder="Search deleted records…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="glass-tray" style={{ flexWrap: "wrap" }}>
          <button onClick={() => setTypeFilter("all")}
            className={`glass-pill ${typeFilter === "all" ? "glass-pill-active" : ""}`}>
            All ({items.length})
          </button>
          {allTypes.filter((t) => typeCounts[t]).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`glass-pill ${typeFilter === t ? "glass-pill-active" : ""}`}>
              {TYPE_LABELS[t]} ({typeCounts[t]})
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState
            message={search ? `No results for "${search}"` : typeFilter === "all" ? "Trash is empty" : `No deleted ${TYPE_LABELS[typeFilter] || typeFilter} records`}
            description={search ? "Try a different search term" : undefined}
          />
        ) : (
          <>
            {/* Column header — desktop */}
            <div className="hidden sm:flex items-center gap-4 px-5 py-2 bg-table-head border-b border-base text-[11px] font-semibold uppercase tracking-wide text-faint">
              <span className="w-24 shrink-0">Type</span>
              <span className="flex-1">Record</span>
              <span className="w-24 text-right shrink-0">Deleted</span>
              <span className="w-36 shrink-0" />
            </div>
            <div className="divide-y divide-[var(--color-border-soft)]">
              {filtered.map((item) => <ItemRow key={item._id} item={item} />)}
            </div>
          </>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center gap-2 mt-3 text-xs text-faint">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Records are automatically purged 90 days after deletion. The progress bar shows time remaining.
        </div>
      )}
    </div>
  );
}
