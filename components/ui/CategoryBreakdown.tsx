/**
 * CategoryBreakdown — shows per-category progress with full Recycling / EOL breakdown.
 *
 * Two modes:
 *  • legacy  — caller passes `rows[]` (flat base/used totals, no type split)
 *  • typed   — caller passes `entries[]` (TypedEntry[]) + `achievedMap`; renders
 *              each category split into RECYCLING and EOL sub-rows.
 */
"use client";

import { Recycle, Leaf } from "lucide-react";

// ─── Shared types ──────────────────────────────────────────────────────────

export interface CatRow {
  label: string;
  base: number;
  used: number;
}

export interface TypedEntry {
  categoryId: string;
  type: "RECYCLING" | "EOL";
  value: number;
}

interface Props {
  clientType: "PWP" | "PIBO";
  rows?: CatRow[];
  entries?: TypedEntry[];
  achievedMap?: Record<string, number>;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const COLORS = [
  { bar: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-700 dark:text-blue-300",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { bar: "bg-teal-500",   bg: "bg-teal-50 dark:bg-teal-900/20",   text: "text-teal-700 dark:text-teal-300",   badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  { bar: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  { bar: "bg-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20",  text: "text-amber-700 dark:text-amber-300",  badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
];

const CAT_DISPLAY: Record<string, string> = {
  "1": "CAT-I", "2": "CAT-II", "3": "CAT-III", "4": "CAT-IV",
};

// ─── Type pill ─────────────────────────────────────────────────────────────

function TypePill({ type }: { type: "RECYCLING" | "EOL" }) {
  if (type === "EOL") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
        <Leaf className="w-2.5 h-2.5" />EOL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 px-1.5 py-0.5 rounded-full">
      <Recycle className="w-2.5 h-2.5" />Recycling
    </span>
  );
}

// ─── Typed breakdown ────────────────────────────────────────────────────────

function TypedBreakdown({ clientType, entries, achievedMap }: {
  clientType: "PWP" | "PIBO";
  entries: TypedEntry[];
  achievedMap: Record<string, number>;
}) {
  const isPWP = clientType === "PWP";
  const baseLabel = isPWP ? "Generated" : "Target";
  const usedLabel = isPWP ? "Sold" : "Achieved";

  const catIds = [...new Set(entries.map((e) => e.categoryId))].sort();

  const totalBase = entries.reduce((s, e) => s + e.value, 0);
  const totalUsed = entries.reduce((s, e) => s + (achievedMap[`${e.categoryId}|${e.type}`] ?? 0), 0);
  const totalRemaining = totalBase - totalUsed;
  const totalPct = totalBase > 0 ? Math.min(100, Math.round((totalUsed / totalBase) * 100)) : 0;

  return (
    <div className="space-y-5">
      {/* Overall summary */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Overall Progress</span>
          <span className="text-xs font-bold text-default">{totalPct}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-3">
          <div className={`h-2.5 rounded-full transition-all ${totalPct >= 100 ? "bg-emerald-500" : "bg-brand-500"}`}
            style={{ width: `${totalPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: `Total ${baseLabel}`, val: totalBase, cls: "text-default" },
            { label: `Total ${usedLabel}`, val: totalUsed, cls: "text-brand-600" },
            { label: "Total Remaining", val: totalRemaining, cls: totalRemaining < 0 ? "text-red-500" : "text-emerald-600" },
          ].map(({ label, val, cls }) => (
            <div key={label} className="text-center">
              <p className="text-xs text-faint mb-0.5">{label}</p>
              <p className={`text-lg font-bold ${cls}`}>{val.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-category breakdown */}
      <div className="space-y-3">
        {catIds.map((catId, i) => {
          const catEntries = entries.filter((e) => e.categoryId === catId);
          const catBase = catEntries.reduce((s, e) => s + e.value, 0);
          const catUsed = catEntries.reduce((s, e) => s + (achievedMap[`${e.categoryId}|${e.type}`] ?? 0), 0);
          const catRemaining = catBase - catUsed;
          const catPct = catBase > 0 ? Math.min(100, Math.round((catUsed / catBase) * 100)) : 0;
          const color = COLORS[i % COLORS.length];

          return (
            <div key={catId} className={`rounded-xl p-3.5 ${color.bg}`}>
              {/* Category header */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${color.text}`}>
                  {CAT_DISPLAY[catId] ?? `CAT-${catId}`}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
                  {catPct}% used
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/60 dark:bg-black/20 rounded-full h-1.5 mb-3">
                <div className={`h-1.5 rounded-full transition-all ${color.bar}`} style={{ width: `${catPct}%` }} />
              </div>

              {/* Per-type sub-rows */}
              <div className="space-y-2">
                {catEntries.map((entry) => {
                  const typeUsed = achievedMap[`${entry.categoryId}|${entry.type}`] ?? 0;
                  const typeRemaining = entry.value - typeUsed;
                  const typePct = entry.value > 0 ? Math.min(100, Math.round((typeUsed / entry.value) * 100)) : 0;
                  return (
                    <div key={`${entry.categoryId}|${entry.type}`}
                      className="bg-white/50 dark:bg-black/10 rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <TypePill type={entry.type} />
                        <span className="text-[10px] text-faint">{typePct}%</span>
                      </div>
                      <div className="w-full bg-white/60 dark:bg-black/20 rounded-full h-1 mb-2">
                        <div className={`h-1 rounded-full transition-all ${typePct >= 100 ? "bg-emerald-500" : color.bar}`}
                          style={{ width: `${typePct}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[9px] text-faint uppercase tracking-wide">{baseLabel}</p>
                          <p className="font-semibold text-xs text-default">{entry.value.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-faint uppercase tracking-wide">{usedLabel}</p>
                          <p className={`font-semibold text-xs ${color.text}`}>{typeUsed.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-faint uppercase tracking-wide">Remaining</p>
                          <p className={`font-semibold text-xs ${typeRemaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {typeRemaining.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Category totals row (shown only when multiple types exist) */}
              {catEntries.length > 1 && (
                <div className="mt-2 pt-2 border-t border-white/30 dark:border-black/20 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[9px] text-faint uppercase tracking-wide">Total {baseLabel}</p>
                    <p className="font-bold text-xs text-default">{catBase.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-faint uppercase tracking-wide">Total {usedLabel}</p>
                    <p className={`font-bold text-xs ${color.text}`}>{catUsed.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-faint uppercase tracking-wide">Remaining</p>
                    <p className={`font-bold text-xs ${catRemaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {catRemaining.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Legacy flat breakdown ──────────────────────────────────────────────────

function LegacyBreakdown({ clientType, rows }: { clientType: "PWP" | "PIBO"; rows: CatRow[] }) {
  const isPWP = clientType === "PWP";
  const baseLabel = isPWP ? "Generated" : "Target";
  const usedLabel = isPWP ? "Sold" : "Achieved";

  const totalBase = rows.reduce((s, r) => s + r.base, 0);
  const totalUsed = rows.reduce((s, r) => s + r.used, 0);
  const totalRemaining = totalBase - totalUsed;
  const totalPct = totalBase > 0 ? Math.min(100, Math.round((totalUsed / totalBase) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Overall Progress</span>
          <span className="text-xs font-bold text-default">{totalPct}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-3">
          <div className={`h-2.5 rounded-full transition-all ${totalPct >= 100 ? "bg-emerald-500" : "bg-brand-500"}`}
            style={{ width: `${totalPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: `Total ${baseLabel}`, val: totalBase, cls: "text-default" },
            { label: `Total ${usedLabel}`, val: totalUsed, cls: "text-brand-600" },
            { label: "Total Remaining", val: totalRemaining, cls: totalRemaining < 0 ? "text-red-500" : "text-emerald-600" },
          ].map(({ label, val, cls }) => (
            <div key={label} className="text-center">
              <p className="text-xs text-faint mb-0.5">{label}</p>
              <p className={`text-lg font-bold ${cls}`}>{val.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((row, i) => {
          const remaining = row.base - row.used;
          const pct = row.base > 0 ? Math.min(100, Math.round((row.used / row.base) * 100)) : 0;
          const color = COLORS[i % COLORS.length];
          return (
            <div key={row.label} className={`rounded-xl p-3.5 ${color.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${color.text}`}>{row.label}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>{pct}% used</span>
              </div>
              <div className="w-full bg-white/60 dark:bg-black/20 rounded-full h-1.5 mb-3">
                <div className={`h-1.5 rounded-full transition-all ${color.bar}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-faint uppercase tracking-wide">{baseLabel}</p>
                  <p className="font-semibold text-sm text-default">{row.base.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-faint uppercase tracking-wide">{usedLabel}</p>
                  <p className={`font-semibold text-sm ${color.text}`}>{row.used.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-faint uppercase tracking-wide">Remaining</p>
                  <p className={`font-semibold text-sm ${remaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {remaining.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────

export function CategoryBreakdown({ clientType, rows, entries, achievedMap }: Props) {
  if (entries && entries.length > 0) {
    return <TypedBreakdown clientType={clientType} entries={entries} achievedMap={achievedMap ?? {}} />;
  }
  return <LegacyBreakdown clientType={clientType} rows={rows ?? []} />;
}
