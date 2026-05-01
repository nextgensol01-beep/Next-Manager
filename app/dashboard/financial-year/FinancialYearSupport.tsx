"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Leaf, Recycle, X } from "lucide-react";
export interface Client { clientId: string; companyName: string; category: string; }

export interface TargetEntry {
  categoryId: string;   // "1" | "2" | "3" | "4"
  type: "RECYCLING" | "EOL";
  value: number;
}
export type GeneratedEntry = TargetEntry; // same shape
export type UsageEntry = TargetEntry;

export interface FYRecord {
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

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const CAT_IDS = ["1", "2", "3", "4"] as const;
export const CAT_DISPLAY: Record<string, string> = { "1": "CAT-I", "2": "CAT-II", "3": "CAT-III", "4": "CAT-IV" };

export const CREDIT_TYPES: { value: "RECYCLING" | "EOL"; label: string; icon: React.ReactNode }[] = [
  { value: "RECYCLING", label: "Recycling", icon: <Recycle className="w-3.5 h-3.5" /> },
  { value: "EOL", label: "End of Life", icon: <Leaf className="w-3.5 h-3.5" /> },
];

export function createEmptyGeneratedForm(financialYear: string) {
  return {
    clientId: "",
    financialYear,
  };
}

export function emptyTarget(): TargetEntry {
  return { categoryId: "1", type: "RECYCLING", value: 0 };
}
export function buildEntryValueMap(entries: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> | undefined) {
  const map: Record<string, number> = {};
  for (const entry of entries ?? []) {
    const key = `${entry.categoryId}|${entry.type}`;
    map[key] = (map[key] ?? 0) + entry.value;
  }
  return map;
}

// â”€â”€â”€ Table helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const TH = ({ children, right, width, first, last }: {
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

export const TD = ({ children, right, mono, dim }: {
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

// â”€â”€â”€ Portal Tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function RemainingTooltip({ rec, isPWP }: { rec: FYRecord; isPWP: boolean }) {
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

// â”€â”€â”€ Target Row Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TargetRowProps {
  entry: TargetEntry;
  index: number;
  isDupe: boolean;
  onChange: (idx: number, updated: TargetEntry) => void;
  onRemove: (idx: number) => void;
}

export function TargetRow({ entry, index, isDupe, onChange, onRemove }: TargetRowProps) {
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