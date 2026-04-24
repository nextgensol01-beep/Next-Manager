"use client";

import { BarChart2, Leaf, Pencil, Recycle } from "lucide-react";
import { formatDateTime, type FYRecord } from "./ClientProfileSupport";

type CreditType = "RECYCLING" | "EOL";

type FyCategoryRow = {
  label: string;
  categoryId: string;
  base: number;
  used: number;
  remaining: number;
  typedRows: Array<{
    type: CreditType;
    base: number;
    used: number;
    remaining: number;
  }>;
};

type FyTypeTotal = {
  type: CreditType;
  base: number;
  used: number;
  remaining: number;
};

type ClientProfileFinancialSummaryProps = {
  fyData: FYRecord;
  selectedFy: string;
  isPWP: boolean;
  fyLastUpdated: string;
  fyCategoryRows: FyCategoryRow[];
  fyHasTypedSplit: boolean;
  fyTypeTotals: FyTypeTotal[];
  openFYModal: (record?: FYRecord | null) => void;
  setBreakdownRec: (record: FYRecord) => void;
};

export default function ClientProfileFinancialSummary({
  fyData,
  selectedFy,
  isPWP,
  fyLastUpdated,
  fyCategoryRows,
  fyHasTypedSplit,
  fyTypeTotals,
  openFYModal,
  setBreakdownRec,
}: ClientProfileFinancialSummaryProps) {
  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-default">{isPWP ? "Credits Summary" : "Target Summary"} {"\u2014"} FY {selectedFy}</h3>
        <div className="glass-tray">
          <button
            type="button"
            onClick={() => openFYModal(fyData)}
            className="glass-pill"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit FY
          </button>
          <button
            onClick={() => setBreakdownRec(fyData)}
            className="glass-pill"
          >
            <BarChart2 className="w-3.5 h-3.5" /> Breakdown
          </button>
        </div>
      </div>
      {fyLastUpdated && <p className="text-xs text-faint mb-4">Last updated {formatDateTime(fyLastUpdated)}</p>}
      <div className="border border-base rounded-xl overflow-hidden mb-4">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr className="bg-surface border-b border-base">
              <th className="text-left text-xs text-muted font-semibold px-4 py-2">Category</th>
              <th className="text-right text-xs text-muted font-semibold px-4 py-2">{isPWP ? "Generated" : "Target"}</th>
              <th className="text-right text-xs text-muted font-semibold px-4 py-2">{isPWP ? "Sold" : "Achieved"}</th>
              <th className="text-right text-xs text-muted font-semibold px-4 py-2">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {fyCategoryRows.map((row) => {
              const pct = row.base > 0 ? Math.round((row.used / row.base) * 100) : 0;
              return (
                <tr key={row.categoryId} className="border-b border-base last:border-0">
                  <td className="px-4 py-2.5 font-medium text-default">{row.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {fyHasTypedSplit ? (
                      <div className="space-y-1">
                        {row.typedRows.map((item) => (
                          <div key={item.type} className="flex items-center justify-end gap-1.5">
                            {item.type === "RECYCLING"
                              ? <Recycle className="w-3 h-3 text-teal-500 flex-shrink-0" />
                              : <Leaf className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                            <span>{item.base.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : row.base.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {fyHasTypedSplit ? (
                      <div className="space-y-1">
                        {row.typedRows.map((item) => {
                          const typePct = item.base > 0 ? Math.round((item.used / item.base) * 100) : 0;
                          return (
                            <div key={item.type} className="flex items-center justify-end gap-1.5">
                              {item.type === "RECYCLING"
                                ? <Recycle className="w-3 h-3 text-teal-500 flex-shrink-0" />
                                : <Leaf className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                              <span className={`font-mono ${isPWP ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>{item.used.toLocaleString()}</span>
                              {item.base > 0 && <span className="text-[10px] text-faint">({typePct}%)</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <span className={`font-mono ${isPWP ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>{row.used.toLocaleString()}</span>
                        {row.base > 0 && <span className="text-xs text-faint ml-1">({pct}%)</span>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {fyHasTypedSplit ? (
                      <div className="space-y-1">
                        {row.typedRows.map((item) => (
                          <div key={item.type} className="flex items-center justify-end gap-1.5">
                            {item.type === "RECYCLING"
                              ? <Recycle className="w-3 h-3 text-teal-500 flex-shrink-0" />
                              : <Leaf className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                            <span className={`font-mono font-semibold ${item.remaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>{item.remaining.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className={`font-mono font-semibold ${row.remaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>{row.remaining.toLocaleString()}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {isPWP ? (
          <>
            <div className="bg-surface rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Total Generated</p><p className="text-xl font-bold text-default">{(fyData.totalGenerated ?? fyData.totalCredits ?? fyData.availableCredits ?? 0).toLocaleString()}</p>{fyHasTypedSplit && <div className="mt-2 flex justify-center gap-2 text-[10px] text-faint">{fyTypeTotals.map((item) => <span key={item.type}>{item.type === "RECYCLING" ? "R" : "E"}: {item.base.toLocaleString()}</span>)}</div>}</div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Total Sold</p><p className="text-xl font-bold text-red-600 dark:text-red-400">{(fyData.totalSold ?? fyData.totalUsed ?? fyData.usedCredits ?? 0).toLocaleString()}</p>{fyHasTypedSplit && <div className="mt-2 flex justify-center gap-2 text-[10px] text-faint">{fyTypeTotals.map((item) => <span key={item.type}>{item.type === "RECYCLING" ? "R" : "E"}: {item.used.toLocaleString()}</span>)}</div>}</div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Remaining</p><p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{(fyData.totalRemaining ?? fyData.remainingCredits ?? 0).toLocaleString()}</p>{fyHasTypedSplit && <div className="mt-2 flex justify-center gap-2 text-[10px] text-faint">{fyTypeTotals.map((item) => <span key={item.type}>{item.type === "RECYCLING" ? "R" : "E"}: {item.remaining.toLocaleString()}</span>)}</div>}</div>
          </>
        ) : (
          <>
            <div className="bg-surface rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Total Target</p><p className="text-xl font-bold text-default">{(fyData.totalTarget ?? fyData.targetAmount ?? 0).toLocaleString()}</p>{fyHasTypedSplit && <div className="mt-2 flex justify-center gap-2 text-[10px] text-faint">{fyTypeTotals.map((item) => <span key={item.type}>{item.type === "RECYCLING" ? "R" : "E"}: {item.base.toLocaleString()}</span>)}</div>}</div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Achieved</p><p className="text-xl font-bold text-blue-600 dark:text-blue-400">{(fyData.totalAchieved ?? fyData.achievedAmount ?? 0).toLocaleString()}</p>{fyHasTypedSplit && <div className="mt-2 flex justify-center gap-2 text-[10px] text-faint">{fyTypeTotals.map((item) => <span key={item.type}>{item.type === "RECYCLING" ? "R" : "E"}: {item.used.toLocaleString()}</span>)}</div>}</div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Remaining</p><p className="text-xl font-bold text-amber-600 dark:text-amber-400">{(fyData.totalRemainingTarget ?? fyData.remainingTarget ?? 0).toLocaleString()}</p>{fyHasTypedSplit && <div className="mt-2 flex justify-center gap-2 text-[10px] text-faint">{fyTypeTotals.map((item) => <span key={item.type}>{item.type === "RECYCLING" ? "R" : "E"}: {item.remaining.toLocaleString()}</span>)}</div>}</div>
          </>
        )}
      </div>
    </div>
  );
}
