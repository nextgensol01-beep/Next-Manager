"use client";

import { ArrowUpRight, Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { targetProgress } from "@/lib/report-studio-view";
import type { ReportStudioResponse } from "@/lib/report-studio";

export type ReportFocus = { field: string; value?: number | string; operator?: "gt" | "eq" | "lt"; label: string };
const number = (value: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);

export default function ReportOverview({ report, onFocus }: { report: ReportStudioResponse; onFocus: (focus: ReportFocus) => void }) {
  const metric = (id: string) => report.summary.metrics.find((entry) => entry.field === id)?.value;
  const hasTarget = metric("target.overall.target") != null;
  const target = metric("target.overall.target");
  const achieved = metric("target.overall.achieved");
  const remaining = metric("target.overall.remaining");
  const progress = targetProgress(target, achieved);
  const value = (amount: number | undefined) => amount == null ? "—" : number(amount);

  if (hasTarget) return <section className="report-overview" aria-label="Target overview">
    <div className="report-progress-summary">
      <div className="report-progress-heading"><span className="report-eyebrow"><Target size={14} /> Target progress</span><span className="report-caption">{number(report.summary.matchedClients)} matching clients</span></div>
      <div className="report-progress-content">
        <div><div className="report-progress-number">{progress == null ? <span className="report-no-target">{target === 0 ? "No target" : "Not calculated"}</span> : <>{number(Math.round(progress * 10) / 10)}<span>%</span></>}</div><p className="report-caption">{progress == null ? "Progress needs a target and achievement." : "of the total target achieved"}</p></div>
        <div className="report-progress-detail"><div className="report-linear-progress" role="progressbar" aria-label="Overall target achievement" aria-valuenow={progress == null ? undefined : Math.min(100, Math.max(0, progress))} aria-valuetext={progress == null ? "No progress calculated" : `${number(progress)}% achieved`}><span style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }} /></div>
          <div className="report-target-values">
            <div><span>Target quantity</span><strong>{value(target)}</strong></div>
            <div><span>Achieved</span><strong className="report-success">{value(achieved)}</strong></div>
            <button disabled={remaining == null || remaining <= 0} onClick={() => onFocus({ field: "target.overall.remaining", label: "Remaining target", value: 0 })}><span>Remaining <ArrowUpRight size={13} /></span><strong>{value(remaining)}</strong></button>
          </div>
        </div>
      </div>
    </div>
    <div className="report-category-cards">{["1", "2", "3", "4"].map((id, index) => {
      const categoryTarget = metric(`target.cat${id}.total.target`);
      if (categoryTarget == null) return null;
      const categoryAchieved = metric(`target.cat${id}.total.achieved`);
      const categoryRemaining = metric(`target.cat${id}.total.remaining`);
      const percent = targetProgress(categoryTarget, categoryAchieved);
      const label = `CAT ${["I", "II", "III", "IV"][index]}`;
      return <button key={id} className="report-category-card" disabled={categoryTarget <= 0} onClick={() => onFocus({ field: `target.cat${id}.total.target`, value: 0, label })} aria-label={`${label}: ${categoryTarget === 0 ? "No target" : `${value(categoryRemaining)} remaining. View clients`}`}>
        <div><strong>{label}</strong>{categoryTarget > 0 ? <ArrowUpRight size={15} /> : <span className="report-caption">No target</span>}</div>
        <p>{value(categoryRemaining)} <span>remaining</span></p>
        <div className="report-linear-progress"><span style={{ width: `${Math.min(100, Math.max(0, percent || 0))}%` }} /></div>
        <span className="report-caption">{percent == null ? "—" : `${number(Math.round(percent * 10) / 10)}% achieved`} <span aria-hidden="true">·</span> {value(categoryTarget)} target</span>
      </button>;
    })}</div>
  </section>;

  return <div className="report-overview"><section className="report-kpi-grid" aria-label="Report summary">{report.summary.metrics.slice(0, 4).map((entry) => {
    const focus = entry.field === "billing.outstanding" ? { field: entry.field, value: 0, label: "Outstanding balance" }
      : entry.field === "pwp.remaining" ? { field: entry.field, value: 0, label: "Available credits" } : null;
    const content = <><span className="report-eyebrow">{entry.label}{focus && <ArrowUpRight size={15} />}</span><strong>{entry.type === "currency" ? formatCurrency(entry.value) : `${number(entry.value)}${entry.type === "percentage" ? "%" : ""}`}</strong><span className="report-caption">{focus ? "View matching clients" : entry.type === "quantity" ? "Quantity · all matching clients" : entry.type === "percentage" ? "Average across applicable records" : "Across all matching records"}</span></>;
    return focus ? <button key={entry.field} className="report-kpi" onClick={() => onFocus(focus)}>{content}</button> : <div key={entry.field} className="report-kpi">{content}</div>;
  })}</section>{Boolean(report.summary.focusOptions?.length) && <div className="report-focus-options"><span>Explore</span>{report.summary.focusOptions?.map((focus) => <button key={focus.field + focus.value} onClick={() => onFocus(focus)}>{focus.label}<strong>{number(focus.count)}</strong><ArrowUpRight size={13} /></button>)}</div>}</div>;
}
