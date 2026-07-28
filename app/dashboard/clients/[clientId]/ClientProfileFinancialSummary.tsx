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
  openFYModal,
  setBreakdownRec,
}: ClientProfileFinancialSummaryProps) {
  const baseTotal = fyCategoryRows.reduce((sum, row) => sum + row.base, 0);
  const usedTotal = fyCategoryRows.reduce((sum, row) => sum + row.used, 0);
  const remainingTotal = baseTotal - usedTotal;
  const percentage = baseTotal > 0 ? Math.round((usedTotal / baseTotal) * 100) : 0;
  const safePercentage = Math.max(0, Math.min(100, percentage));

  return (
    <div className="client-profile-card client-profile-fy-progress">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">{isPWP ? "FY Credits" : "FY Targets"}</p>
          <h2>{isPWP ? "Generated and sold credits" : "Target achievement"} · FY {selectedFy}</h2>
          <span>{isPWP ? "Generated credits are compared only with sold or used credits." : "Targets are compared only with achieved quantities."}</span>
        </div>
        <div className="client-profile-fy-actions">
          <button
            type="button"
            onClick={() => openFYModal(fyData)}
            className="client-profile-secondary-button"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit FY
          </button>
          <button
            type="button"
            onClick={() => setBreakdownRec(fyData)}
            className="client-profile-secondary-button"
          >
            <BarChart2 className="w-3.5 h-3.5" /> Breakdown
          </button>
        </div>
      </div>

      <div className="client-profile-fy-hero">
        <div
          className="client-profile-fy-ring"
          data-exceeded={percentage > 100 ? "true" : "false"}
          style={{ background: `conic-gradient(${percentage > 100 ? "#ff3b30" : "#14a39a"} ${safePercentage * 3.6}deg, rgba(120,120,128,0.14) 0)` }}
        >
          <div><strong>{percentage}%</strong><span>{isPWP ? "utilised" : "achieved"}</span></div>
        </div>
        <div className="client-profile-fy-total">
          <small>{isPWP ? "Generated" : "Target"}</small>
          <strong>{baseTotal.toLocaleString("en-IN")}</strong>
        </div>
        <div className="client-profile-fy-total" data-tone="used">
          <small>{isPWP ? "Sold / Used" : "Achieved"}</small>
          <strong>{usedTotal.toLocaleString("en-IN")}</strong>
        </div>
        <div className="client-profile-fy-total" data-tone={remainingTotal < 0 ? "danger" : "remaining"}>
          <small>Remaining</small>
          <strong>{remainingTotal.toLocaleString("en-IN")}</strong>
        </div>
      </div>

      <div className="client-profile-fy-categories">
        {fyCategoryRows.map((row) => {
          const rowPercentage = row.base > 0 ? Math.round((row.used / row.base) * 100) : 0;
          return (
            <div
              key={row.categoryId}
              data-empty={row.base === 0 && row.used === 0 ? "true" : "false"}
              data-exceeded={row.remaining < 0 ? "true" : "false"}
            >
              <div className="client-profile-fy-category-head">
                <div><strong>{row.label}</strong><span>{rowPercentage}% {isPWP ? "utilised" : "achieved"}</span></div>
                <strong>{row.remaining.toLocaleString("en-IN")} remaining</strong>
              </div>
              <div className="client-profile-fy-category-track"><span style={{ width: `${Math.max(0, Math.min(100, rowPercentage))}%` }} /></div>
              <div className="client-profile-fy-category-values">
                <span>{isPWP ? "Generated" : "Target"} <strong>{row.base.toLocaleString("en-IN")}</strong></span>
                <span>{isPWP ? "Sold / Used" : "Achieved"} <strong>{row.used.toLocaleString("en-IN")}</strong></span>
              </div>
              {fyHasTypedSplit && (
                <div className="client-profile-fy-types">
                  {row.typedRows.map((item) => (
                    <span key={item.type}>
                      {item.type === "RECYCLING" ? <Recycle className="h-3.5 w-3.5" /> : <Leaf className="h-3.5 w-3.5" />}
                      {item.type === "RECYCLING" ? "Recycling" : "EOL"} · {item.used.toLocaleString("en-IN")} / {item.base.toLocaleString("en-IN")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {fyLastUpdated && <p className="client-profile-fy-updated">Last updated {formatDateTime(fyLastUpdated)}</p>}
    </div>
  );
}
