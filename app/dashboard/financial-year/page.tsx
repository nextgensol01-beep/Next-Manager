"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { CategoryBreakdown } from "@/components/ui/CategoryBreakdown";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import FYTabBar from "@/components/ui/FYTabBar";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { Plus, Pencil, Trash2, BarChart2, ChevronDown, Search, X, Recycle, Leaf } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import { createPortal } from "react-dom";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Client { clientId: string; companyName: string; category: string; }

interface TargetEntry {
  categoryId: string;   // "1" | "2" | "3" | "4"
  type: "RECYCLING" | "EOL";
  value: number;
}
type GeneratedEntry = TargetEntry; // same shape
type UsageEntry = TargetEntry;

interface FYRecord {
  _id: string; clientId: string; financialYear: string;
  cat1Generated?: number; cat2Generated?: number; cat3Generated?: number; cat4Generated?: number;
  cat1Target?: number; cat2Target?: number; cat3Target?: number; cat4Target?: number;
  soldCat1?: number; soldCat2?: number; soldCat3?: number; soldCat4?: number;
  achievedCat1?: number; achievedCat2?: number; achievedCat3?: number; achievedCat4?: number;
  remainingCat1?: number; remainingCat2?: number; remainingCat3?: number; remainingCat4?: number;
  remainingTargetCat1?: number; remainingTargetCat2?: number;
  remainingTargetCat3?: number; remainingTargetCat4?: number;
  totalGenerated?: number; totalSold?: number; totalRemaining?: number;
  totalTarget?: number; totalAchieved?: number; totalRemainingTarget?: number;
  generated?: GeneratedEntry[];
  targets?: TargetEntry[];
  soldByType?: UsageEntry[];
  achievedByType?: UsageEntry[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CAT_IDS = ["1", "2", "3", "4"] as const;
const CAT_DISPLAY: Record<string, string> = { "1": "CAT-I", "2": "CAT-II", "3": "CAT-III", "4": "CAT-IV" };

const CREDIT_TYPES: { value: "RECYCLING" | "EOL"; label: string; icon: React.ReactNode }[] = [
  { value: "RECYCLING", label: "Recycling", icon: <Recycle className="w-3.5 h-3.5" /> },
  { value: "EOL", label: "End of Life", icon: <Leaf className="w-3.5 h-3.5" /> },
];

function createEmptyGeneratedForm(financialYear: string) {
  return {
    clientId: "",
    financialYear,
  };
}

function emptyTarget(): TargetEntry {
  return { categoryId: "1", type: "RECYCLING", value: 0 };
}
function buildEntryValueMap(entries: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> | undefined) {
  const map: Record<string, number> = {};
  for (const entry of entries ?? []) {
    const key = `${entry.categoryId}|${entry.type}`;
    map[key] = (map[key] ?? 0) + entry.value;
  }
  return map;
}

// ─── Table helpers ─────────────────────────────────────────────────────────

const TH = ({ children, right, width, first, last }: {
  children?: React.ReactNode; right?: boolean; width?: string;
  first?: boolean; last?: boolean;
}) => (
  <th
    style={{ width, textAlign: right ? "right" : "left" }}
    className={`bg-[var(--color-table-head)] text-[var(--color-text-muted)] text-xs font-semibold
      uppercase tracking-wide px-4 py-3 whitespace-nowrap
      ${first ? "rounded-tl-2xl" : ""} ${last ? "rounded-tr-2xl" : ""}`}
  >
    {children}
  </th>
);

const TD = ({ children, right, mono, dim }: {
  children?: React.ReactNode; right?: boolean; mono?: boolean; dim?: boolean;
}) => (
  <td
    style={{ textAlign: right ? "right" : "left" }}
    className={`px-4 py-3 text-sm border-t border-[var(--color-border-soft)] whitespace-nowrap
      ${mono ? "font-mono" : ""} ${dim ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]"}`}
  >
    {children}
  </td>
);

// ─── Portal Tooltip ─────────────────────────────────────────────────────────

function RemainingTooltip({ rec, isPWP }: { rec: FYRecord; isPWP: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: "top" as "top" | "bottom", arrowLeft: 0 });
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const baseLabel = isPWP ? "Generated" : "Target";
  const purchasedLabel = isPWP ? "Sold" : "Purchased";
  const baseEntries = isPWP ? rec.generated : rec.targets;
  const purchasedEntries = isPWP ? rec.soldByType : rec.achievedByType;
  const baseMap = buildEntryValueMap(baseEntries);
  const purchasedMap = buildEntryValueMap(purchasedEntries);

  const categoryBreakdown = CAT_IDS.map((categoryId) => {
    const label = CAT_DISPLAY[categoryId];
    const types = (["RECYCLING", "EOL"] as const).map((type) => {
      const base = baseMap[`${categoryId}|${type}`] ?? 0;
      const purchased = purchasedMap[`${categoryId}|${type}`] ?? 0;
      const remainingByType = Math.max(0, base - purchased);
      const excess = Math.max(0, purchased - base);

      return { type, base, purchased, remainingByType, excess };
    });

    return {
      label,
      types,
      hasData: types.some((item) => item.base > 0 || item.purchased > 0),
      remaining: types.reduce((sum, item) => sum + item.remainingByType, 0),
      excess: types.reduce((sum, item) => sum + item.excess, 0),
    };
  });

  const visibleCategories = categoryBreakdown.some((item) => item.hasData)
    ? categoryBreakdown.filter((item) => item.hasData)
    : categoryBreakdown;
  const total = isPWP ? (rec.totalGenerated ?? 0) : (rec.totalTarget ?? 0);
  const used = isPWP ? (rec.totalSold ?? 0) : (rec.totalAchieved ?? 0);
  const remaining = total - used;
  const tooltipRemaining = visibleCategories.reduce((sum, item) => sum + item.remaining, 0);
  const tooltipExcess = visibleCategories.reduce((sum, item) => sum + item.excess, 0);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  useLayoutEffect(() => {
    if (!open || !ref.current || !tooltipRef.current) return;

    const updatePosition = () => {
      if (!ref.current || !tooltipRef.current) return;

      const margin = 12;
      const gap = 8;
      const anchorRect = ref.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);
      left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

      let placement: "top" | "bottom" = "top";
      let top = anchorRect.top - tooltipRect.height - gap;

      if (top < margin) {
        placement = "bottom";
        top = anchorRect.bottom + gap;
      }

      if (top + tooltipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - tooltipRect.height - margin);
      }

      const anchorCenter = anchorRect.left + (anchorRect.width / 2);
      const arrowLeft = Math.max(18, Math.min(anchorCenter - left, tooltipRect.width - 18));

      setPos((prev) => {
        if (
          prev.top === top &&
          prev.left === left &&
          prev.placement === placement &&
          prev.arrowLeft === arrowLeft
        ) {
          return prev;
        }

        return { top, left, placement, arrowLeft };
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setHoveredCategory(null);
      closeTimeoutRef.current = null;
    }, 120);
  };

  const onEnter = () => {
    clearCloseTimeout();
    setOpen(true);
  };

  const onLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (
      nextTarget &&
      (ref.current?.contains(nextTarget) || tooltipRef.current?.contains(nextTarget))
    ) {
      return;
    }
    scheduleClose();
  };

  useLayoutEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, []);

  return (
    <>
      <div ref={ref} className="cursor-default" onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <p className={`font-semibold text-sm ${isPWP
          ? remaining > 0 ? "text-emerald-500 dark:text-emerald-400"
            : remaining === 0 ? "text-amber-500"
              : "text-red-500"
          : remaining === 0 ? "text-emerald-500 dark:text-emerald-400"
            : remaining < 0 ? "text-blue-400"
              : remaining <= total * 0.2 ? "text-amber-500"
                : "text-orange-500"
          }`}>
          {remaining.toLocaleString()}
        </p>
        <div className="w-16 bg-[var(--color-border)] rounded-full h-1 mt-1">
          <div className={`h-1 rounded-full ${isPWP
            ? remaining <= 0 ? "bg-emerald-500" : "bg-blue-500"
            : pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-500" : "bg-orange-500"
            }`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-[22rem] max-w-[calc(100vw-1.5rem)] bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text)]
                     text-xs rounded-xl shadow-2xl p-2.5 pointer-events-auto"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <p className="font-semibold text-[var(--color-text-muted)] mb-1.5 text-[10px] uppercase tracking-wide">
            {isPWP ? "Credits" : "Target"} Remaining
          </p>
          <div className="space-y-2">
            {visibleCategories.map((category) => (
              <div
                key={category.label}
                className={`rounded-lg border px-2.5 py-2 transition-all duration-150 ${
                  hoveredCategory === category.label
                    ? "border-brand-400/60 bg-[var(--color-surface)] shadow-md shadow-black/10"
                    : "border-[var(--color-border-soft)] bg-[var(--color-surface)]/70"
                }`}
                onMouseEnter={() => setHoveredCategory(category.label)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {category.label}
                  </span>
                  <div className="flex items-center gap-2 text-[9px]">
                    <span className="text-[var(--color-text-faint)]">
                      Remaining <strong className={`font-mono text-emerald-400 transition-all ${hoveredCategory === category.label ? "text-[11px]" : ""}`}>{category.remaining.toLocaleString()}</strong>
                    </span>
                    <span className="text-[var(--color-text-faint)]">
                      Excess <strong className={`font-mono text-blue-400 transition-all ${hoveredCategory === category.label ? "text-[11px]" : ""}`}>{category.excess.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {category.types.map((item) => (
                    <div
                      key={`${category.label}|${item.type}`}
                      className={`rounded-md px-2 py-1.5 transition-all ${
                        hoveredCategory === category.label
                          ? "bg-[var(--color-card)]"
                          : "bg-[var(--color-card)]/70"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-[var(--color-text)]">
                          {item.type === "RECYCLING"
                            ? <Recycle className="w-3 h-3 text-teal-400" />
                            : <Leaf className="w-3 h-3 text-amber-400" />}
                          <span className="font-medium">{item.type === "RECYCLING" ? "Recycling" : "EOL"}</span>
                        </div>
                        <span className="text-[9px] text-[var(--color-text-faint)]">
                          {item.base === 0 && item.purchased === 0 ? "No data" : "Tracked"}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-[9px]">
                        <div>
                          <p className="uppercase tracking-wide text-[var(--color-text-faint)]">{baseLabel}</p>
                          <p className={`font-mono font-semibold text-[var(--color-text)] transition-all ${hoveredCategory === category.label ? "text-[12px]" : "text-[10px]"}`}>{item.base.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide text-[var(--color-text-faint)]">{purchasedLabel}</p>
                          <p className={`font-mono font-semibold text-blue-400 transition-all ${hoveredCategory === category.label ? "text-[12px]" : "text-[10px]"}`}>{item.purchased.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide text-[var(--color-text-faint)]">Remaining</p>
                          <p className={`font-mono font-semibold text-emerald-400 transition-all ${hoveredCategory === category.label ? "text-[12px]" : "text-[10px]"}`}>{item.remainingByType.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide text-[var(--color-text-faint)]">Excess</p>
                          <p className={`font-mono font-semibold text-blue-400 transition-all ${hoveredCategory === category.label ? "text-[12px]" : "text-[10px]"}`}>{item.excess.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 pt-2 border-t border-[var(--color-border)] flex justify-between gap-3 text-[10px]">
            <span className="text-[var(--color-text-faint)]">Totals</span>
            <div className="flex items-center gap-4">
              <span className="text-[var(--color-text-faint)]">
                Remaining <strong className="font-mono font-bold text-emerald-400">{tooltipRemaining.toLocaleString()}</strong>
              </span>
              <span className="text-[var(--color-text-faint)]">
                Excess <strong className="font-mono font-bold text-blue-400">{tooltipExcess.toLocaleString()}</strong>
              </span>
            </div>
          </div>
          <div
            className="absolute w-0 h-0"
            style={pos.placement === "top"
              ? {
                  top: "100%",
                  left: pos.arrowLeft,
                  transform: "translateX(-50%)",
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "5px solid var(--color-border)",
                }
              : {
                  bottom: "100%",
                  left: pos.arrowLeft,
                  transform: "translateX(-50%)",
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderBottom: "5px solid var(--color-border)",
                }}
          />
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Target Row Editor ──────────────────────────────────────────────────────

interface TargetRowProps {
  entry: TargetEntry;
  index: number;
  isDupe: boolean;
  onChange: (idx: number, updated: TargetEntry) => void;
  onRemove: (idx: number) => void;
}

function TargetRow({ entry, index, isDupe, onChange, onRemove }: TargetRowProps) {
  return (
    <div
      className={`grid grid-cols-[1fr_1.7fr_1fr_26px] items-center gap-2 px-2 py-1.5 rounded-xl border transition-colors
      ${isDupe
        ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
        : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}
    >
      {/* Category */}
      <select
        className="input-field !py-1 !text-xs w-full min-w-0"
        value={entry.categoryId}
        onChange={(e) => onChange(index, { ...entry, categoryId: e.target.value })}
      >
        {CAT_IDS.map((id) => (
          <option key={id} value={id}>
            {CAT_DISPLAY[id]}
          </option>
        ))}
      </select>

      {/* Type */}
      <div className="flex gap-1 w-full">
        {CREDIT_TYPES.map((ct) => (
          <button
            key={ct.value}
            type="button"
            onClick={() => onChange(index, { ...entry, type: ct.value })}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${
                entry.type === ct.value
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-brand-300"
              }`}
          >
            {ct.icon}
            <span className="text-[11px]">
              {ct.value === "RECYCLING" ? "Recycling" : "EOL"}
            </span>
          </button>
        ))}
      </div>

      {/* Value */}
      <input
        type="number"
        min="0"
        className="input-field !py-1 !text-xs w-full font-mono text-center"
        value={entry.value === 0 ? "" : entry.value}
        placeholder="0"
        onChange={(e) =>
          onChange(index, { ...entry, value: Number(e.target.value) || 0 })
        }
      />

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="w-[26px] h-[26px] flex items-center justify-center text-[var(--color-text-faint)] hover:text-red-500
                   hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FinancialYearPage() {
  const [fy, setFy] = useFinancialYearState();
  const { effectiveFinancialYear } = useFinancialYearPreference();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FYRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);
  const [expandedFY, setExpandedFY] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Form state — generated fields (PWP) + targets[] (PIBO)
  const [genForm, setGenForm] = useState(() => createEmptyGeneratedForm(effectiveFinancialYear));
  const [generated, setGenerated] = useState<GeneratedEntry[]>([]);
  const [targets, setTargets] = useState<TargetEntry[]>([]);

  const { data: records, loading: recLoading, refetch: refetchRecords } =
    useCache<FYRecord[]>(`/api/financial-year?fy=${fy}`, { initialData: [] });
  const { data: clients } = useCache<Client[]>("/api/clients", { initialData: [] });

  const getCategory = (id: string) => clients.find((c) => c.clientId === id)?.category || "";
  const getClientName = (id: string) => clients.find((c) => c.clientId === id)?.companyName || id;

  const filteredRecords = records.filter((rec) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      getClientName(rec.clientId).toLowerCase().includes(q) ||
      rec.clientId.toLowerCase().includes(q) ||
      getCategory(rec.clientId).toLowerCase().includes(q)
    );
  });

  // ── Modal open helpers ──────────────────────────────────────────────────

  const openAdd = () => {
    setEditRecord(null);
    setGenForm(createEmptyGeneratedForm(fy));
    setGenerated([emptyTarget()]);
    setTargets([emptyTarget()]);
    setModalOpen(true);
  };

  const openEdit = (rec: FYRecord) => {
    setEditRecord(rec);
    setGenForm({
      clientId: rec.clientId,
      financialYear: rec.financialYear,
    });

    // Populate generated[]: use new structure if present, migrate from legacy flat fields
    if (Array.isArray(rec.generated) && rec.generated.length > 0) {
      setGenerated(rec.generated.map((t) => ({ ...t })));
    } else {
      const migrated: GeneratedEntry[] = [];
      for (let i = 1; i <= 4; i++) {
        const val = Number((rec as unknown as Record<string, unknown>)[`cat${i}Generated`] ?? 0);
        if (val > 0) migrated.push({ categoryId: String(i), type: "RECYCLING", value: val });
      }
      setGenerated(migrated.length > 0 ? migrated : [emptyTarget()]);
    }

    // Populate targets[]: use new structure if present, migrate from legacy flat fields
    if (Array.isArray(rec.targets) && rec.targets.length > 0) {
      setTargets(rec.targets.map((t) => ({ ...t })));
    } else {
      const migrated: TargetEntry[] = [];
      for (let i = 1; i <= 4; i++) {
        const val = Number((rec as unknown as Record<string, unknown>)[`cat${i}Target`] ?? 0);
        if (val > 0) migrated.push({ categoryId: String(i), type: "RECYCLING", value: val });
      }
      setTargets(migrated.length > 0 ? migrated : [emptyTarget()]);
    }

    setModalOpen(true);
  };

  // ── Target row mutations ────────────────────────────────────────────────

  const handleGeneratedChange = (idx: number, updated: GeneratedEntry) => {
    setGenerated((prev) => prev.map((t, i) => (i === idx ? updated : t)));
  };
  const addGenerated = () => setGenerated((prev) => [...prev, emptyTarget()]);
  const removeGenerated = (idx: number) =>
    setGenerated((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const handleTargetChange = (idx: number, updated: TargetEntry) => {
    setTargets((prev) => prev.map((t, i) => (i === idx ? updated : t)));
  };

  const addTarget = () => setTargets((prev) => [...prev, emptyTarget()]);

  const removeTarget = (idx: number) =>
    setTargets((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  // Duplicate detection for generated[]
  const genDupeSet = new Set<string>();
  const genDupeIndices = new Set<number>();
  generated.forEach((t, i) => {
    const key = `${t.categoryId}|${t.type}`;
    if (genDupeSet.has(key)) genDupeIndices.add(i);
    else genDupeSet.add(key);
  });
  generated.forEach((t, i) => {
    if (!genDupeIndices.has(i)) {
      const key = `${t.categoryId}|${t.type}`;
      if (generated.filter((o, j) => j !== i && `${o.categoryId}|${o.type}` === key).length > 0)
        genDupeIndices.add(i);
    }
  });

  // Duplicate detection for targets[]
  const dupeSet = new Set<string>();
  const dupeIndices = new Set<number>();
  targets.forEach((t, i) => {
    const key = `${t.categoryId}|${t.type}`;
    if (dupeSet.has(key)) dupeIndices.add(i);
    else dupeSet.add(key);
  });
  targets.forEach((t, i) => {
    if (!dupeIndices.has(i)) {
      const key = `${t.categoryId}|${t.type}`;
      if (targets.filter((o, j) => j !== i && `${o.categoryId}|${o.type}` === key).length > 0)
        dupeIndices.add(i);
    }
  });
  const hasGenDupes = genDupeIndices.size > 0;
  const hasTgtDupes = dupeIndices.size > 0;
  const hasDupes = hasGenDupes || hasTgtDupes;

  // ── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async (rec: FYRecord) => {
    if (!confirm(`Delete FY record for ${getClientName(rec.clientId)} — ${rec.financialYear}?`)) return;
    setDeletingId(rec._id);
    const res = await fetch(`/api/financial-year/${rec._id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Record deleted"); invalidate("/api/financial-year", "/api/dashboard"); refetchRecords(); }
    else toast.error("Failed to delete");
    setDeletingId(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasDupes) { toast.error("Remove duplicate category+type combinations before saving"); return; }
    setSaving(true);

    try {
      const selectedCat = getCategory(genForm.clientId);
      const isPWP = selectedCat === "PWP";

      const payload: Record<string, unknown> = {
        clientId: genForm.clientId,
        financialYear: genForm.financialYear,
      };

      if (isPWP) {
        // Include generated[] — backend derives flat cat1Generated…cat4Generated
        payload.generated = generated.filter((t) => t.value > 0);
      } else {
        // Include targets[] — backend derives flat cat1Target…cat4Target
        payload.targets = targets.filter((t) => t.value > 0);
      }

      const url = editRecord ? `/api/financial-year/${editRecord._id}` : "/api/financial-year";
      const method = editRecord ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { toast.error("Error saving"); return; }
      toast.success(editRecord ? "Updated!" : "Saved!");
      invalidate("/api/financial-year", "/api/dashboard");
      setModalOpen(false);
      refetchRecords();
    } finally { setSaving(false); }
  };

  const selectedCat = getCategory(genForm.clientId);
  const isPWP = selectedCat === "PWP";
  const isSIMP = selectedCat === "SIMP";

  // Target totals for the summary bar
  const targetTotal = targets.reduce((s, t) => s + (t.value || 0), 0);
  const targetTotalRecycl = targets.filter((t) => t.type === "RECYCLING").reduce((s, t) => s + t.value, 0);
  const targetTotalEOL = targets.filter((t) => t.type === "EOL").reduce((s, t) => s + t.value, 0);

  // Generated totals for PWP summary bar
  const generatedTotal = generated.reduce((s, t) => s + (t.value || 0), 0);
  const generatedTotalRecycl = generated.filter((t) => t.type === "RECYCLING").reduce((s, t) => s + t.value, 0);
  const generatedTotalEOL = generated.filter((t) => t.type === "EOL").reduce((s, t) => s + t.value, 0);

  /**
   * Build typed entries + achievedMap for the breakdown modal.
   * For PIBO: uses targets[] with per-type achieved values.
   * For PWP:  uses generated[] with per-type sold values.
   * Falls back to flat legacy rows when no typed array is present.
   */
  const makeBreakdownProps = (rec: FYRecord, cat: string) => {
    const isPWPRow = cat === "PWP";

    if (isPWPRow) {
      const entries = Array.isArray(rec.generated) && rec.generated.length > 0 ? rec.generated : null;
      if (entries) {
        const achievedMap = buildEntryValueMap(rec.soldByType);
        return { entries, achievedMap, rows: undefined };
      }
      // Legacy flat fallback
      return {
        entries: null,
        rows: [
          { label: "CAT-I",   base: rec.cat1Generated ?? 0, used: rec.soldCat1 ?? 0 },
          { label: "CAT-II",  base: rec.cat2Generated ?? 0, used: rec.soldCat2 ?? 0 },
          { label: "CAT-III", base: rec.cat3Generated ?? 0, used: rec.soldCat3 ?? 0 },
          { label: "CAT-IV",  base: rec.cat4Generated ?? 0, used: rec.soldCat4 ?? 0 },
        ],
      };
    }

    // PIBO — targets with type breakdown
    const entries = Array.isArray(rec.targets) && rec.targets.length > 0 ? rec.targets : null;
    if (entries) {
      const achievedMapFromTx = buildEntryValueMap(rec.achievedByType);
      const hasTypedAchieved = Object.keys(achievedMapFromTx).length > 0;
      if (hasTypedAchieved) {
        return { entries, achievedMap: achievedMapFromTx, rows: undefined };
      }

      // Legacy fallback when typed transaction data is unavailable.
      const achievedMap: Record<string, number> = {};
      const catIds = [...new Set(entries.map((e) => e.categoryId))];
      for (const catId of catIds) {
        const catEntries = entries.filter((e) => e.categoryId === catId);
        const catTotal = catEntries.reduce((s, e) => s + e.value, 0);
        const rawAchieved =
          catId === "1" ? (rec.achievedCat1 ?? 0) :
          catId === "2" ? (rec.achievedCat2 ?? 0) :
          catId === "3" ? (rec.achievedCat3 ?? 0) :
          catId === "4" ? (rec.achievedCat4 ?? 0) : 0;
        for (const entry of catEntries) {
          const share = catTotal > 0 ? entry.value / catTotal : 1 / catEntries.length;
          achievedMap[`${catId}|${entry.type}`] = Math.round(rawAchieved * share);
        }
      }
      return { entries, achievedMap, rows: undefined };
    }

    // Legacy flat fallback
    return {
      entries: null,
      rows: [
        { label: "CAT-I",   base: rec.cat1Target ?? 0, used: rec.achievedCat1 ?? 0 },
        { label: "CAT-II",  base: rec.cat2Target ?? 0, used: rec.achievedCat2 ?? 0 },
        { label: "CAT-III", base: rec.cat3Target ?? 0, used: rec.achievedCat3 ?? 0 },
        { label: "CAT-IV",  base: rec.cat4Target ?? 0, used: rec.achievedCat4 ?? 0 },
      ],
    };
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Financial Year" description="Manage category-wise targets and credits per FY">
        <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" /> Add Record</button>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      {/* Search */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm transition-colors">
        <div className="flex items-center gap-2 bg-surface rounded-xl px-3">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by client name, ID or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-0 ring-0 outline-none flex-1 py-2 text-sm text-default placeholder:text-faint"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-faint hover:text-default transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap gap-4 mb-4 px-1 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span><b className="text-[var(--color-text)]">PWP</b> — credits remaining (more = better)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
          <span><b className="text-[var(--color-text)]">PIBO</b> — target remaining (less = better; 0 = fully achieved)</span>
        </span>
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="bg-card rounded-2xl shadow-sm border border-base hidden lg:block">
        {recLoading ? <LoadingSpinner /> : filteredRecords.length === 0 ? (
          <EmptyState message={search ? `No results for "${search}"` : "No records for this FY"} />
        ) : (
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
                  <TH first>Client</TH><TH>Type</TH>
                  <TH right>CAT-I</TH><TH right>CAT-II</TH><TH right>CAT-III</TH><TH right>CAT-IV</TH>
                  <TH right>Total</TH><TH right>Used / Achieved</TH><TH>Remaining</TH><TH last />
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => {
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

                  // Type-split cell renderer for both PWP (generated[]) and PIBO (targets[])
                  const hasTypedGenerated = isPWPRow && Array.isArray(rec.generated) && rec.generated.length > 0;
                  const hasTypedTargets   = !isPWPRow && Array.isArray(rec.targets) && rec.targets.length > 0;
                  const hasTypedSplit     = hasTypedGenerated || hasTypedTargets;
                  const typedCatCell = (catId: string) => {
                    if (!hasTypedSplit) return null;
                    const source = hasTypedGenerated ? rec.generated! : rec.targets!;
                    const entries = source.filter((t) => t.categoryId === catId);
                    if (entries.length === 0) return <span className="text-[var(--color-text-faint)] font-mono text-xs">—</span>;
                    return (
                      <div className="text-right space-y-0.5">
                        {entries.map((e) => (
                          <div key={e.type} className="flex items-center justify-end gap-1">
                            {e.type === "RECYCLING"
                              ? <Recycle className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />
                              : <Leaf className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />}
                            <span className="font-mono text-xs">{e.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    );
                  };

                  return (
                    <tr key={rec._id} className={`hover:bg-surface transition-colors ${deleting ? "opacity-30" : ""}`}>
                      <TD>
                        <p className="font-medium truncate">{getClientName(rec.clientId)}</p>
                        <p className="text-xs text-[var(--color-text-faint)] font-mono">{rec.clientId}</p>
                      </TD>
                      <TD>{cat && <CategoryBadge category={cat} />}</TD>
                      {isSIMPRow ? (
                        <TD><span className="text-xs italic text-[var(--color-text-faint)]">SIMP — no targets/credits tracked</span></TD>
                      ) : (
                        <>
                          <TD right mono>{hasTypedSplit ? typedCatCell("1") : cat1.toLocaleString()}</TD>
                          <TD right mono>{hasTypedSplit ? typedCatCell("2") : cat2.toLocaleString()}</TD>
                          <TD right mono>{hasTypedSplit ? typedCatCell("3") : cat3.toLocaleString()}</TD>
                          <TD right mono>{hasTypedSplit ? typedCatCell("4") : cat4.toLocaleString()}</TD>
                          <TD right><span className="font-semibold">{total.toLocaleString()}</span></TD>
                          <TD right><span className="font-semibold text-blue-500">{used.toLocaleString()}</span></TD>
                          <TD>
                            <div className="flex items-center gap-1.5">
                              <RemainingTooltip rec={rec} isPWP={isPWPRow} />
                              <button
                                onClick={() => setBreakdownRec(rec)}
                                title="Category breakdown"
                                className="p-1 text-[var(--color-text-faint)] hover:text-blue-500
                                           hover:bg-blue-500/10 rounded-lg transition-colors flex-shrink-0"
                              >
                                <BarChart2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </TD>
                        </>
                      )}
                      <TD>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(rec)} disabled={deleting}
                            className="p-1.5 text-[var(--color-text-faint)] hover:text-amber-500
                                       hover:bg-amber-500/10 rounded-lg transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(rec)} disabled={deleting}
                            className="p-1.5 text-[var(--color-text-faint)] hover:text-red-500
                                       hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TD>
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
        {recLoading ? <LoadingSpinner /> : filteredRecords.length === 0 ? (
          <EmptyState message={search ? `No results for "${search}"` : "No records for this FY"} />
        ) : filteredRecords.map((rec) => {
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
          // Type-split display for both PWP (generated[]) and PIBO (targets[])
          const mobileHasTypedGenerated = isPWPRow && Array.isArray(rec.generated) && rec.generated.length > 0;
          const mobileHasTypedTargets   = !isPWPRow && Array.isArray(rec.targets) && rec.targets.length > 0;
          const mobileHasTypedSplit     = mobileHasTypedGenerated || mobileHasTypedTargets;
          return (
            <div key={rec._id}
              className={`bg-card border border-base rounded-2xl shadow-sm overflow-hidden
                          transition-colors ${deleting ? "opacity-40" : ""}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
                onClick={() => setExpandedFY(isExp ? null : rec._id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-semibold text-sm text-default truncate">{getClientName(rec.clientId)}</span>
                    {cat && <CategoryBadge category={cat} />}
                  </div>
                  <p className="text-xs text-faint font-mono">{rec.clientId}</p>
                </div>
                {!isSIMPRow && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-faint">{isPWPRow ? "Generated" : "Target"}</p>
                    <p className="font-bold text-sm text-default">{total.toLocaleString()}</p>
                  </div>
                )}
                <ChevronDown
                  className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200"
                  style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {isExp && (
                <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-3">
                  {isSIMPRow ? (
                    <p className="text-xs italic text-faint">SIMP — no targets/credits tracked</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {([
                          { label: "CAT-I",   catId: "1", val: cat1 },
                          { label: "CAT-II",  catId: "2", val: cat2 },
                          { label: "CAT-III", catId: "3", val: cat3 },
                          { label: "CAT-IV",  catId: "4", val: cat4 },
                        ]).map(({ label, catId, val }) => {
                          const mobileSource = mobileHasTypedGenerated ? rec.generated! : rec.targets!;
                          const typedEntries = mobileHasTypedSplit
                            ? mobileSource.filter((t) => t.categoryId === catId)
                            : [];
                          return (
                            <div key={label} className="bg-surface rounded-lg px-3 py-2">
                              <span className="text-faint block mb-1">{label}</span>
                              {typedEntries.length > 0 ? (
                                <div className="space-y-0.5">
                                  {typedEntries.map((e) => (
                                    <div key={e.type} className="flex items-center gap-1">
                                      {e.type === "RECYCLING"
                                        ? <Recycle className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />
                                        : <Leaf className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />}
                                      <span className="font-mono font-semibold text-default">{e.value.toLocaleString()}</span>
                                      <span className="text-faint text-[10px]">{e.type === "RECYCLING" ? "R" : "E"}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="font-mono font-semibold text-default">{Number(val).toLocaleString()}</span>
                              )}
                            </div>
                          );
                        })}
                        <div className="bg-surface rounded-lg px-3 py-2">
                          <span className="text-faint block">Total</span>
                          <span className="font-mono font-bold text-default">{total.toLocaleString()}</span>
                        </div>
                        <div className="bg-surface rounded-lg px-3 py-2">
                          <span className="text-faint block">{isPWPRow ? "Sold" : "Achieved"}</span>
                          <span className="font-mono font-semibold text-blue-500">{used.toLocaleString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setBreakdownRec(rec)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg
                                   border border-base hover:bg-hover transition-colors text-muted"
                      >
                        <BarChart2 className="w-3.5 h-3.5" />Breakdown
                      </button>
                    </>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => openEdit(rec)} disabled={deleting}
                      className="flex-1 btn-secondary justify-center text-xs py-1.5">
                      <Pencil className="w-3.5 h-3.5" />Edit
                    </button>
                    <button onClick={() => handleDelete(rec)} disabled={deleting}
                      className="flex-1 justify-center text-xs py-1.5 flex items-center gap-1.5
                                 text-red-500 border border-red-200 dark:border-red-900/40 rounded-lg
                                 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium">
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Breakdown modal ── */}
      {breakdownRec && (() => {
        const _bCat = getCategory(breakdownRec.clientId);
        const _bProps = makeBreakdownProps(breakdownRec, _bCat);
        return (
          <Modal open={!!breakdownRec} onClose={() => setBreakdownRec(null)}
            title={`${getClientName(breakdownRec.clientId)} — FY ${breakdownRec.financialYear}`} size="lg">
            <CategoryBreakdown
              clientType={_bCat === "PWP" ? "PWP" : "PIBO"}
              entries={_bProps.entries ?? undefined}
              achievedMap={_bProps.achievedMap}
              rows={_bProps.rows}
            />
          </Modal>
        );
      })()}

      {/* ── Add / Edit modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editRecord ? "Edit FY Record" : "Add FY Record"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Client + FY selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Client *</label>
              <select
                className="input-field"
                value={genForm.clientId}
                onChange={(e) => setGenForm({ ...genForm, clientId: e.target.value })}
                required
                disabled={!!editRecord}
              >
                <option value="">Select Client</option>
                {clients.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.companyName} ({c.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Financial Year *</label>
              <select
                className="input-field"
                value={genForm.financialYear}
                onChange={(e) => setGenForm({ ...genForm, financialYear: e.target.value })}
                required
              >
                {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* ── PWP: Credits Generated (per category + type) ── */}
          {selectedCat && isPWP && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Credits Generated — Category &amp; Type
                </p>
                <span className="text-[10px] text-faint">Same category can have both types</span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1.7fr_1fr_26px] items-center gap-2 px-2 mb-1.5
                text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wide">
                <span>Category</span>
                <span className="text-center">Type</span>
                <span className="text-right">Generated</span>
                <span />
              </div>

              {/* Generated rows */}
              <div className="space-y-2 relative">
                {generated.map((entry, idx) => (
                  <div key={idx} className="relative">
                    <TargetRow
                      entry={entry}
                      index={idx}
                      isDupe={genDupeIndices.has(idx)}
                      onChange={handleGeneratedChange}
                      onRemove={removeGenerated}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addGenerated}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400
                           hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20
                           transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Generated Row
              </button>

              {hasGenDupes && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span>⚠</span> Remove duplicate Category + Type combinations before saving.
                </p>
              )}

              {generatedTotal > 0 && (
                <div className="mt-3 bg-surface rounded-xl p-3 text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-muted">Total Generated:</span>
                    <span className="font-bold text-brand-700">{generatedTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--color-text-faint)]">
                    {generatedTotalRecycl > 0 && (
                      <span className="flex items-center gap-1">
                        <Recycle className="w-3 h-3 text-teal-500" />
                        Recycling: <strong className="text-[var(--color-text)] ml-0.5">{generatedTotalRecycl.toLocaleString()}</strong>
                      </span>
                    )}
                    {generatedTotalEOL > 0 && (
                      <span className="flex items-center gap-1">
                        <Leaf className="w-3 h-3 text-amber-500" />
                        EOL: <strong className="text-[var(--color-text)] ml-0.5">{generatedTotalEOL.toLocaleString()}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PIBO: EPR Targets (multi-row with type) ── */}
          {selectedCat && !isPWP && !isSIMP && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  EPR Targets — Category &amp; Type
                </p>
                <span className="text-[10px] text-faint">
                  Same category can have both types
                </span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1.7fr_1fr_26px] items-center gap-2 px-2 mb-1.5
                    text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wide">
                <span>Category</span>
                <span className="text-center">Type</span>
                <span className="text-right">Target</span>
                <span />
              </div>

              {/* Target rows */}
              <div className="space-y-2 relative">
                {targets.map((entry, idx) => (
                  <div key={idx} className="relative">
                    <TargetRow
                      entry={entry}
                      index={idx}
                      isDupe={dupeIndices.has(idx)}
                      onChange={handleTargetChange}
                      onRemove={removeTarget}
                    />
                  </div>
                ))}
              </div>

              {/* Add row button */}
              <button
                type="button"
                onClick={addTarget}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400
                           hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20
                           transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Target Row
              </button>

              {/* Duplicate warning */}
              {hasTgtDupes && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span>⚠</span> Remove duplicate Category + Type combinations before saving.
                </p>
              )}

              {/* Totals summary */}
              {targetTotal > 0 && (
                <div className="mt-3 bg-surface rounded-xl p-3 text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-muted">Total Target:</span>
                    <span className="font-bold text-brand-700">{targetTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--color-text-faint)]">
                    {targetTotalRecycl > 0 && (
                      <span className="flex items-center gap-1">
                        <Recycle className="w-3 h-3 text-teal-500" />
                        Recycling: <strong className="text-[var(--color-text)] ml-0.5">{targetTotalRecycl.toLocaleString()}</strong>
                      </span>
                    )}
                    {targetTotalEOL > 0 && (
                      <span className="flex items-center gap-1">
                        <Leaf className="w-3 h-3 text-amber-500" />
                        EOL: <strong className="text-[var(--color-text)] ml-0.5">{targetTotalEOL.toLocaleString()}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SIMP notice */}
          {isSIMP && (
            <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800
                            rounded-xl p-3 text-sm text-pink-700 dark:text-pink-300">
              SIMP clients are registered for compliance tracking only — no targets or credits needed.
            </div>
          )}

          {!selectedCat && (
            <p className="text-sm text-faint text-center py-4">
              Select a client to see the relevant fields
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn-primary flex-1 justify-center"
              disabled={saving || !selectedCat || isSIMP || hasDupes}
            >
              {saving ? "Saving..." : "Save Record"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
