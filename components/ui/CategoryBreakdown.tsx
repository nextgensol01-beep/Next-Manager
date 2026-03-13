"use client";

interface CatRow {
  label: string;
  base: number;   // generated (PWP) or target (PIBO)
  used: number;   // sold (PWP) or achieved (PIBO)
}

interface Props {
  clientType: "PWP" | "PIBO";
  rows: CatRow[];
}

const COLORS = [
  { bar: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-700 dark:text-blue-300",   badge: "bg-blue-100 text-blue-700" },
  { bar: "bg-teal-500",   bg: "bg-teal-50 dark:bg-teal-900/20",   text: "text-teal-700 dark:text-teal-300",   badge: "bg-teal-100 text-teal-700" },
  { bar: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300", badge: "bg-violet-100 text-violet-700" },
  { bar: "bg-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20",  text: "text-amber-700 dark:text-amber-300",  badge: "bg-amber-100 text-amber-700" },
];

export function CategoryBreakdown({ clientType, rows }: Props) {
  const isPWP = clientType === "PWP";
  const baseLabel = isPWP ? "Generated" : "Target";
  const usedLabel = isPWP ? "Sold" : "Achieved";

  const totalBase = rows.reduce((s, r) => s + r.base, 0);
  const totalUsed = rows.reduce((s, r) => s + r.used, 0);
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
          <div
            className={`h-2.5 rounded-full transition-all ${totalPct >= 100 ? "bg-emerald-500" : "bg-brand-500"}`}
            style={{ width: `${totalPct}%` }}
          />
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
