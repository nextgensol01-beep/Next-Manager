"use client";
import React, { useState, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { CategoryBreakdown } from "@/components/ui/CategoryBreakdown";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { FINANCIAL_YEARS, CURRENT_FY } from "@/lib/utils";
import { Plus, Pencil, Trash2, BarChart2, ChevronDown } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import { createPortal } from "react-dom";

interface Client { clientId: string; companyName: string; category: string; }
interface FYRecord {
  _id: string; clientId: string; financialYear: string;
  cat1Generated?: number; cat2Generated?: number; cat3Generated?: number; cat4Generated?: number;
  cat1Target?: number;    cat2Target?: number;    cat3Target?: number;    cat4Target?: number;
  soldCat1?: number;      soldCat2?: number;      soldCat3?: number;      soldCat4?: number;
  achievedCat1?: number;  achievedCat2?: number;  achievedCat3?: number;  achievedCat4?: number;
  remainingCat1?: number; remainingCat2?: number; remainingCat3?: number; remainingCat4?: number;
  remainingTargetCat1?: number; remainingTargetCat2?: number; remainingTargetCat3?: number; remainingTargetCat4?: number;
  totalGenerated?: number; totalSold?: number; totalRemaining?: number;
  totalTarget?: number;   totalAchieved?: number; totalRemainingTarget?: number;
}

const CATS = ["Cat I", "Cat II", "Cat III", "Cat IV"] as const;
const emptyForm = {
  clientId: "", financialYear: CURRENT_FY,
  cat1Generated: "0", cat2Generated: "0", cat3Generated: "0", cat4Generated: "0",
  cat1Target: "0",    cat2Target: "0",    cat3Target: "0",    cat4Target: "0",
};

// Shared cell style — right-aligned numeric, no extra classes that fight each other
const TH = ({ children, right, width }: { children?: React.ReactNode; right?: boolean; width?: string }) => (
  <th
    style={{ width, textAlign: right ? "right" : "left" }}
    className="bg-[var(--color-table-head)] text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-wide px-4 py-3 whitespace-nowrap"
  >
    {children}
  </th>
);
const TD = ({ children, right, mono, dim }: { children?: React.ReactNode; right?: boolean; mono?: boolean; dim?: boolean }) => (
  <td
    style={{ textAlign: right ? "right" : "left" }}
    className={`px-4 py-3 text-sm border-t border-[var(--color-border-soft)] whitespace-nowrap ${mono ? "font-mono" : ""} ${dim ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]"}`}
  >
    {children}
  </td>
);

// ── Portal tooltip ────────────────────────────────────────────────────────
function RemainingTooltip({ rec, isPWP }: { rec: FYRecord; isPWP: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const cats = isPWP
    ? [
        { label: "CAT-I",   rem: rec.remainingCat1 ?? 0 },
        { label: "CAT-II",  rem: rec.remainingCat2 ?? 0 },
        { label: "CAT-III", rem: rec.remainingCat3 ?? 0 },
        { label: "CAT-IV",  rem: rec.remainingCat4 ?? 0 },
      ]
    : [
        { label: "CAT-I",   rem: rec.remainingTargetCat1 ?? 0 },
        { label: "CAT-II",  rem: rec.remainingTargetCat2 ?? 0 },
        { label: "CAT-III", rem: rec.remainingTargetCat3 ?? 0 },
        { label: "CAT-IV",  rem: rec.remainingTargetCat4 ?? 0 },
      ];

  const total     = isPWP ? (rec.totalGenerated ?? 0) : (rec.totalTarget ?? 0);
  const used      = isPWP ? (rec.totalSold ?? 0)      : (rec.totalAchieved ?? 0);
  const remaining = total - used;
  const pct       = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  const onEnter = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top + window.scrollY, left: r.left + r.width / 2 });
    setOpen(true);
  };

  return (
    <>
      <div ref={ref} className="cursor-default" onMouseEnter={onEnter} onMouseLeave={() => setOpen(false)}>
        <p className={`font-semibold text-sm ${
          isPWP
            ? remaining > 0 ? "text-emerald-500 dark:text-emerald-400"   // credits available = good
              : remaining === 0 ? "text-amber-500"                         // all sold = warning
              : "text-red-500"                                             // oversold = bad
            : remaining === 0 ? "text-emerald-500 dark:text-emerald-400"  // fully achieved = great
              : remaining < 0 ? "text-blue-400"                           // over-achieved = fine
              : remaining <= total * 0.2 ? "text-amber-500"               // ≤20% left = close
              : "text-orange-500"                                          // still far from target
        }`}>
          {remaining.toLocaleString()}
        </p>
        <div className="w-16 bg-[var(--color-border)] rounded-full h-1 mt-1">
          <div className={`h-1 rounded-full ${
            isPWP
              ? remaining <= 0 ? "bg-emerald-500" : "bg-blue-500"
              : pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-500" : "bg-orange-500"
          }`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "absolute", top: pos.top - 8, left: pos.left, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="w-48 bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text)] text-xs rounded-xl shadow-2xl p-3 pointer-events-none"
        >
          <p className="font-semibold text-[var(--color-text-muted)] mb-2 text-[11px] uppercase tracking-wide">
            {isPWP ? "Credits" : "Target"} Remaining
          </p>
          {cats.map(({ label, rem }) => (
            <div key={label} className="flex justify-between items-center py-0.5">
              <span className="text-[var(--color-text-faint)]">{label}</span>
              <span className={`font-mono font-semibold ${
                isPWP
                  ? rem > 0 ? "text-emerald-400" : rem === 0 ? "text-amber-400" : "text-red-400"
                  : rem === 0 ? "text-emerald-400" : rem < 0 ? "text-blue-400" : "text-orange-400"
              }`}>{rem.toLocaleString()}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex justify-between">
            <span className="text-[var(--color-text-faint)]">Total</span>
            <span className={`font-mono font-bold ${
              isPWP
                ? remaining > 0 ? "text-emerald-400" : remaining === 0 ? "text-amber-400" : "text-red-400"
                : remaining === 0 ? "text-emerald-400" : remaining < 0 ? "text-blue-400" : "text-orange-400"
            }`}>{remaining.toLocaleString()}</span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid var(--color-border)" }} />
        </div>,
        document.body
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function FinancialYearPage() {
  const [fy, setFy]                     = useState(CURRENT_FY);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editRecord, setEditRecord]     = useState<FYRecord | null>(null);
  const [form, setForm]                 = useState(emptyForm);
  const [saving, setSaving]             = useState(false);
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);
  const [expandedFY, setExpandedFY] = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  const { data: records, loading: recLoading, refetch: refetchRecords } =
    useCache<FYRecord[]>(`/api/financial-year?fy=${fy}`, { initialData: [] });
  const { data: clients } = useCache<Client[]>("/api/clients", { initialData: [] });

  const getCategory   = (id: string) => clients.find((c) => c.clientId === id)?.category || "";
  const getClientName = (id: string) => clients.find((c) => c.clientId === id)?.companyName || id;

  const openAdd = () => { setEditRecord(null); setForm({ ...emptyForm, financialYear: fy }); setModalOpen(true); };
  const openEdit = (rec: FYRecord) => {
    setEditRecord(rec);
    setForm({
      clientId: rec.clientId, financialYear: rec.financialYear,
      cat1Generated: String(rec.cat1Generated ?? 0), cat2Generated: String(rec.cat2Generated ?? 0),
      cat3Generated: String(rec.cat3Generated ?? 0), cat4Generated: String(rec.cat4Generated ?? 0),
      cat1Target: String(rec.cat1Target ?? 0), cat2Target: String(rec.cat2Target ?? 0),
      cat3Target: String(rec.cat3Target ?? 0), cat4Target: String(rec.cat4Target ?? 0),
    });
    setModalOpen(true);
  };

  const handleDelete = async (rec: FYRecord) => {
    if (!confirm(`Delete FY record for ${getClientName(rec.clientId)} — ${rec.financialYear}?`)) return;
    setDeletingId(rec._id);
    const res = await fetch(`/api/financial-year/${rec._id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Record deleted"); invalidate("/api/financial-year", "/api/dashboard"); refetchRecords(); }
    else toast.error("Failed to delete");
    setDeletingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        clientId: form.clientId, financialYear: form.financialYear,
        cat1Generated: Number(form.cat1Generated), cat2Generated: Number(form.cat2Generated),
        cat3Generated: Number(form.cat3Generated), cat4Generated: Number(form.cat4Generated),
        cat1Target: Number(form.cat1Target), cat2Target: Number(form.cat2Target),
        cat3Target: Number(form.cat3Target), cat4Target: Number(form.cat4Target),
      };
      const url    = editRecord ? `/api/financial-year/${editRecord._id}` : "/api/financial-year";
      const method = editRecord ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { toast.error("Error saving"); return; }
      toast.success(editRecord ? "Updated!" : "Saved!");
      invalidate("/api/financial-year", "/api/dashboard"); setModalOpen(false); refetchRecords();
    } finally { setSaving(false); }
  };

  const selectedCat = getCategory(form.clientId);
  const isPWP  = selectedCat === "PWP";
  const isSIMP = selectedCat === "SIMP";

  const makeBreakdownRows = (rec: FYRecord, cat: string) => {
    const pw = cat === "PWP";
    return [
      { label: "CAT-I",   base: pw ? (rec.cat1Generated ?? 0) : (rec.cat1Target ?? 0), used: pw ? (rec.soldCat1 ?? 0) : (rec.achievedCat1 ?? 0) },
      { label: "CAT-II",  base: pw ? (rec.cat2Generated ?? 0) : (rec.cat2Target ?? 0), used: pw ? (rec.soldCat2 ?? 0) : (rec.achievedCat2 ?? 0) },
      { label: "CAT-III", base: pw ? (rec.cat3Generated ?? 0) : (rec.cat3Target ?? 0), used: pw ? (rec.soldCat3 ?? 0) : (rec.achievedCat3 ?? 0) },
      { label: "CAT-IV",  base: pw ? (rec.cat4Generated ?? 0) : (rec.cat4Target ?? 0), used: pw ? (rec.soldCat4 ?? 0) : (rec.achievedCat4 ?? 0) },
    ];
  };

  return (
    <div>
      <PageHeader title="Financial Year" description="Manage category-wise targets and credits per FY">
        <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" /> Add Record</button>
      </PageHeader>

      <div className="bg-card rounded-2xl p-4 mb-4 shadow-sm border border-base flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-muted">Financial Year:</span>
        {FINANCIAL_YEARS.map((y) => (
          <button key={y} onClick={() => setFy(y)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${fy === y ? "bg-brand-600 text-white" : "bg-surface text-muted hover:bg-hover"}`}>
            {y}
          </button>
        ))}
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap gap-4 mb-4 px-1 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span><b className="text-[var(--color-text)]">PWP</b> — credits remaining (more = better)</span>
        </span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
          <span><b className="text-[var(--color-text)]">PIBO</b> — target remaining (less = better; 0 = fully achieved)</span>
        </span>
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="bg-card rounded-2xl shadow-sm border border-base hidden lg:block">
        {recLoading ? <LoadingSpinner /> : records.length === 0 ? <EmptyState message="No records for this FY" /> : (
          <TableWrapper>
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: "220px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "80px" }} />
              </colgroup>
              <thead>
                <tr>
                  <TH>Client</TH><TH>Type</TH>
                  <TH right>CAT-I</TH><TH right>CAT-II</TH><TH right>CAT-III</TH><TH right>CAT-IV</TH>
                  <TH right>Total</TH><TH right>Used / Achieved</TH><TH>Remaining</TH><TH />
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => {
                  const cat = getCategory(rec.clientId);
                  const isPWPRow = cat === "PWP";
                  const isSIMPRow = cat === "SIMP";
                  const deleting = deletingId === rec._id;
                  const cat1 = isPWPRow ? (rec.cat1Generated ?? 0) : (rec.cat1Target ?? 0);
                  const cat2 = isPWPRow ? (rec.cat2Generated ?? 0) : (rec.cat2Target ?? 0);
                  const cat3 = isPWPRow ? (rec.cat3Generated ?? 0) : (rec.cat3Target ?? 0);
                  const cat4 = isPWPRow ? (rec.cat4Generated ?? 0) : (rec.cat4Target ?? 0);
                  const total = cat1 + cat2 + cat3 + cat4;
                  const used = isPWPRow ? (rec.totalSold ?? 0) : (rec.totalAchieved ?? 0);
                  return (
                    <tr key={rec._id} className={`hover:bg-surface transition-colors ${deleting ? "opacity-30" : ""}`}>
                      <TD><p className="font-medium truncate">{getClientName(rec.clientId)}</p><p className="text-xs text-[var(--color-text-faint)] font-mono">{rec.clientId}</p></TD>
                      <TD>{cat && <CategoryBadge category={cat} />}</TD>
                      {isSIMPRow ? (<TD><span className="text-xs italic text-[var(--color-text-faint)]">SIMP — no targets/credits tracked</span></TD>) : (
                        <><TD right mono>{cat1.toLocaleString()}</TD><TD right mono>{cat2.toLocaleString()}</TD><TD right mono>{cat3.toLocaleString()}</TD><TD right mono>{cat4.toLocaleString()}</TD>
                          <TD right><span className="font-semibold">{total.toLocaleString()}</span></TD>
                          <TD right><span className="font-semibold text-blue-500">{used.toLocaleString()}</span></TD>
                          <TD><div className="flex items-center gap-1.5"><RemainingTooltip rec={rec} isPWP={isPWPRow} /><button onClick={() => setBreakdownRec(rec)} title="Category breakdown" className="p-1 text-[var(--color-text-faint)] hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors flex-shrink-0"><BarChart2 className="w-3.5 h-3.5" /></button></div></TD>
                        </>
                      )}
                      <TD><div className="flex gap-1">
                        <button onClick={() => openEdit(rec)} disabled={deleting} className="p-1.5 text-[var(--color-text-faint)] hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(rec)} disabled={deleting} className="p-1.5 text-[var(--color-text-faint)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="lg:hidden space-y-2">
        {recLoading ? <LoadingSpinner /> : records.length === 0 ? <EmptyState message="No records for this FY" /> : records.map((rec) => {
          const cat = getCategory(rec.clientId);
          const isPWPRow = cat === "PWP";
          const isSIMPRow = cat === "SIMP";
          const deleting = deletingId === rec._id;
          const cat1 = isPWPRow ? (rec.cat1Generated ?? 0) : (rec.cat1Target ?? 0);
          const cat2 = isPWPRow ? (rec.cat2Generated ?? 0) : (rec.cat2Target ?? 0);
          const cat3 = isPWPRow ? (rec.cat3Generated ?? 0) : (rec.cat3Target ?? 0);
          const cat4 = isPWPRow ? (rec.cat4Generated ?? 0) : (rec.cat4Target ?? 0);
          const total = cat1 + cat2 + cat3 + cat4;
          const used = isPWPRow ? (rec.totalSold ?? 0) : (rec.totalAchieved ?? 0);
          const isExp = expandedFY === rec._id;
          return (
            <div key={rec._id} className={`bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors ${deleting ? "opacity-40" : ""}`}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => setExpandedFY(isExp ? null : rec._id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-semibold text-sm text-default truncate">{getClientName(rec.clientId)}</span>
                    {cat && <CategoryBadge category={cat} />}
                  </div>
                  <p className="text-xs text-faint font-mono">{rec.clientId}</p>
                </div>
                {!isSIMPRow && <div className="text-right flex-shrink-0"><p className="text-xs text-faint">{isPWPRow ? "Generated" : "Target"}</p><p className="font-bold text-sm text-default">{total.toLocaleString()}</p></div>}
                <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
              {isExp && (
                <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-3">
                  {isSIMPRow ? (
                    <p className="text-xs italic text-faint">SIMP — no targets/credits tracked</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {([["CAT-I", cat1], ["CAT-II", cat2], ["CAT-III", cat3], ["CAT-IV", cat4]] as const).map(([label, val]) => (
                          <div key={label} className="bg-surface rounded-lg px-3 py-2">
                            <span className="text-faint block">{label}</span>
                            <span className="font-mono font-semibold text-default">{Number(val).toLocaleString()}</span>
                          </div>
                        ))}
                        <div className="bg-surface rounded-lg px-3 py-2">
                          <span className="text-faint block">Total</span>
                          <span className="font-mono font-bold text-default">{total.toLocaleString()}</span>
                        </div>
                        <div className="bg-surface rounded-lg px-3 py-2">
                          <span className="text-faint block">{isPWPRow ? "Sold" : "Achieved"}</span>
                          <span className="font-mono font-semibold text-blue-500">{used.toLocaleString()}</span>
                        </div>
                      </div>
                      <button onClick={() => setBreakdownRec(rec)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-base hover:bg-hover transition-colors text-muted">
                        <BarChart2 className="w-3.5 h-3.5" />Breakdown
                      </button>
                    </>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => openEdit(rec)} disabled={deleting} className="flex-1 btn-secondary justify-center text-xs py-1.5"><Pencil className="w-3.5 h-3.5" />Edit</button>
                    <button onClick={() => handleDelete(rec)} disabled={deleting} className="flex-1 justify-center text-xs py-1.5 flex items-center gap-1.5 text-red-500 border border-red-200 dark:border-red-900/40 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Breakdown modal */}
      {breakdownRec && (
        <Modal open={!!breakdownRec} onClose={() => setBreakdownRec(null)}
          title={`${getClientName(breakdownRec.clientId)} — FY ${breakdownRec.financialYear}`} size="lg">
          <CategoryBreakdown
            clientType={getCategory(breakdownRec.clientId) === "PWP" ? "PWP" : "PIBO"}
            rows={makeBreakdownRows(breakdownRec, getCategory(breakdownRec.clientId))}
          />
        </Modal>
      )}

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRecord ? "Edit FY Record" : "Add FY Record"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Client *</label>
              <select className="input-field" value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })} required disabled={!!editRecord}>
                <option value="">Select Client</option>
                {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName} ({c.category})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Financial Year *</label>
              <select className="input-field" value={form.financialYear}
                onChange={(e) => setForm({ ...form, financialYear: e.target.value })} required>
                {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {selectedCat && !isSIMP && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {isPWP ? "Credits Generated" : "EPR Targets"} — Category-wise
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATS.map((cat, i) => {
                  const key = isPWP ? `cat${i + 1}Generated` : `cat${i + 1}Target`;
                  return (
                    <div key={cat}>
                      <label className="label">{cat}</label>
                      <input type="number" min="0" className="input-field font-mono"
                        value={form[key as keyof typeof form]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 bg-surface rounded-xl p-3 text-sm flex justify-between">
                <span className="text-muted">Total {isPWP ? "Generated" : "Target"}:</span>
                <span className="font-bold text-brand-700">
                  {(isPWP
                    ? Number(form.cat1Generated)+Number(form.cat2Generated)+Number(form.cat3Generated)+Number(form.cat4Generated)
                    : Number(form.cat1Target)+Number(form.cat2Target)+Number(form.cat3Target)+Number(form.cat4Target)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {isSIMP && (
            <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-xl p-3 text-sm text-pink-700 dark:text-pink-300">
              SIMP clients are registered for compliance tracking only — no targets or credits needed.
            </div>
          )}
          {!selectedCat && <p className="text-sm text-faint text-center py-4">Select a client to see the relevant fields</p>}

          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving || !selectedCat}>
              {saving ? "Saving..." : "Save Record"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
