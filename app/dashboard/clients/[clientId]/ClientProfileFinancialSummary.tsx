"use client";

import { BarChart2, Leaf, Pencil, Recycle } from "lucide-react";
import { formatDateTime, type FYRecord } from "./ClientProfileSupport";
import { useMemo } from "react";
import { calculateTargetCoverage, coveragePercentageText, coverageQuantityText as quantity } from "@/lib/financial-year-coverage";

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
  const coverage = useMemo(() => calculateTargetCoverage(fyData, { clientId: fyData.clientId, financialYear: selectedFy }), [fyData, selectedFy]);
  const baseTotal = isPWP ? fyCategoryRows.reduce((sum, row) => sum + row.base, 0) : coverage.target;
  const usedTotal = isPWP ? fyCategoryRows.reduce((sum, row) => sum + row.used, 0) : coverage.covered;
  const remainingTotal = isPWP ? (baseTotal ?? 0) - (usedTotal ?? 0) : coverage.pending;
  const percentage = isPWP ? (baseTotal ? Math.round(((usedTotal ?? 0) / baseTotal) * 100) : 0) : coverage.percentage;
  const safePercentage = Math.max(0, Math.min(100, percentage ?? 0));

  return (
    <div className="client-profile-card client-profile-fy-progress">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">{isPWP ? "FY Credits" : "FY Targets"}</p>
          <h2>{isPWP ? "Generated and sold credits" : "Overall Target Achievement"} · FY {selectedFy}</h2>
          <span>{isPWP ? "Generated credits are compared only with sold or used credits." : "Recorded target coverage (MT), capped per category and type; eligibility is not verified."}</span>
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
          data-exceeded={isPWP && (percentage ?? 0) > 100 ? "true" : "false"}
          title={isPWP ? "Credit utilisation" : [coverage.status, ...coverage.issues].join(" ")}
          style={{ background: `conic-gradient(${isPWP && (percentage ?? 0) > 100 ? "#ff3b30" : "#14a39a"} ${safePercentage * 3.6}deg, rgba(120,120,128,0.14) 0)` }}
        >
          <div><strong>{isPWP ? `${percentage}%` : coveragePercentageText(percentage)}</strong><span>{isPWP ? "utilised" : coverage.status === "No target" ? "No target" : percentage === null ? "Unavailable" : "achieved"}</span></div>
        </div>
        <div className="client-profile-fy-total">
          <small>{isPWP ? "Generated" : "Total Target"}</small>
          <strong>{quantity(baseTotal)}</strong>
        </div>
        <div className="client-profile-fy-total" data-tone="used">
          <small>{isPWP ? "Sold / Used" : "Target Achieved"}</small>
          <strong>{quantity(usedTotal)}</strong>
        </div>
        <div className="client-profile-fy-total" data-tone={remainingTotal !== null && remainingTotal < 0 ? "danger" : "remaining"}>
          <small>{isPWP ? "Remaining" : "Remaining Target"}</small>
          <strong>{quantity(remainingTotal)}</strong>
        </div>
      </div>

      <div className="client-profile-fy-categories">
        {fyCategoryRows.map((row) => {
          const category = coverage.categories.find(item => item.categoryId === row.categoryId)!;
          const base = isPWP ? row.base : category.target;
          const used = isPWP ? row.used : category.covered;
          const remaining = isPWP ? row.remaining : category.pending;
          const rowPercentage = isPWP ? (row.base > 0 ? Math.round((row.used / row.base) * 100) : 0) : category.percentage;
          const state = isPWP ? `${rowPercentage}% utilised` : base === null ? "Target unavailable" : base === 0 ? "No target" : rowPercentage === null ? "Needs verification" : `${coveragePercentageText(rowPercentage)} achieved`;
          return (
            <div
              key={row.categoryId}
              data-empty={base === 0 && (used ?? 0) === 0 ? "true" : "false"}
              data-exceeded={isPWP && row.remaining < 0 ? "true" : "false"}
            >
              <div className="client-profile-fy-category-head">
                <div><strong>{row.label}</strong><span>{state}</span></div>
                <strong>{quantity(remaining)} remaining</strong>
              </div>
              <div className="client-profile-fy-category-track"><span style={{ width: `${Math.max(0, Math.min(100, rowPercentage ?? 0))}%` }} /></div>
              <div className="client-profile-fy-category-values">
                <span>{isPWP ? "Generated" : "Target"} <strong>{quantity(base)}</strong></span>
                <span>{isPWP ? "Sold / Used" : "Target Achieved"} <strong>{quantity(used)}</strong></span>
              </div>
              {fyHasTypedSplit && (
                <div className="client-profile-fy-types">
                  {row.typedRows.map((item) => {
                    const bucket = category.buckets.find(bucket => bucket.type === item.type)!;
                    return (
                    <span key={item.type}>
                      {item.type === "RECYCLING" ? <Recycle className="h-3.5 w-3.5" /> : <Leaf className="h-3.5 w-3.5" />}
                      {item.type === "RECYCLING" ? "Recycling" : "EOL"} · {quantity(isPWP ? item.used : bucket.covered)} / {quantity(isPWP ? item.base : bucket.target)}
                      {!isPWP && <>{" · "}{bucket.target === 0 ? "No target" : bucket.percentage === null ? "Unavailable" : coveragePercentageText(bucket.percentage)}{" · "}{quantity(bucket.pending)} pending</>}
                    </span>
                  ); })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isPWP && <p className="client-profile-fy-updated" role="status">{coverage.status}{coverage.issues.length ? ` · ${coverage.issues[0]} See Breakdown for details.` : " · Recorded quantities do not certify statutory compliance."}</p>}
      {fyLastUpdated && <p className="client-profile-fy-updated">Last updated {formatDateTime(fyLastUpdated)}</p>}
    </div>
  );
}
