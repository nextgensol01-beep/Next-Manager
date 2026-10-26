"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  activeFinancialYearEntries,
  financialYearUsage,
  FY_CATEGORY_LABELS,
} from "@/lib/financial-year-form";
import type { useFinancialYearForm } from "./useFinancialYearForm";
import { calculateTargetCoverage, coverageQuantityText, targetTrackingProvenance } from "@/lib/financial-year-coverage";

export default function FinancialYearSummary({
  form,
}: {
  form: ReturnType<typeof useFinancialYearForm>;
}) {
  const [expanded, setExpanded] = useState(false),
    reduced = useReducedMotion(),
    breakdownId = useId();
  const usage = financialYearUsage(form.record, form.isPWP);
  const base = activeFinancialYearEntries(form.rows),
    keys = new Set(
      [...base, ...usage.entries].map((row) => `${row.categoryId}|${row.type}`),
    );
  const existingTracking = form.record ? form.record.targetTracking ?? targetTrackingProvenance(form.record as unknown as Record<string, unknown>) : null;
  const coverage = calculateTargetCoverage({ ...form.record, ...form.identity, targets: base,
    targetTracking: existingTracking?.source === "legacy" ? existingTracking : { source: "typed", issues: Object.keys(form.rowErrors).length ? ["Correct invalid or duplicate target rows before calculating coverage."] : [], usageIssues: existingTracking?.usageIssues },
    achievedByType: form.record?.achievedByType ?? (form.record ? undefined : []),
  });
  return (
    <section className="fy-summary" aria-label="Financial year summary">
      <div className="fy-section-heading">
        <div>
          <h4>FY {form.identity.financialYear} Summary</h4>
          <p>
            Entered quantities update here. Completed transactions stay
            unchanged.
          </p>
        </div>
      </div>
      <div className="fy-summary-grid">
        {[
          {
            label: form.isPWP ? "Total Generated" : "Total Target",
            value: form.isPWP ? form.total : coverage.target,
            detail: "Editing",
          },
          {
            label: form.isPWP ? "Sold" : "Target Achieved",
            value: form.isPWP ? usage.total : coverage.covered,
            detail: form.isPWP ? "From credit transactions" : "Recorded target coverage",
          },
          {
            label: "Remaining",
            value: form.isPWP ? form.total - usage.total : coverage.pending,
            detail: "Calculated balance",
          },
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>
              {coverageQuantityText(item.value)}
              <small>MT</small>
            </strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      {!form.isPWP && <p className="fy-help" role="status">{coverage.status} · Internal recorded coverage; eligibility is not verified. {coverage.issues.join(" ")}</p>}
      <div className="fy-summary-breakdown">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={breakdownId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            size={13}
            style={{ transform: `rotate(${expanded ? 0 : -90}deg)` }}
          />
          Category &amp; type breakdown
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={breakdownId}
              className="fy-breakdown-reveal"
              initial={{ height: reduced ? "auto" : 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: reduced ? "auto" : 0, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
            >
              <div
                className="fy-breakdown-table"
                role="table"
                aria-label="Category balances"
              >
                <div role="row" className="fy-breakdown-head">
                  <span role="columnheader">Category / Type</span>
                  <span role="columnheader">
                    {form.isPWP ? "Generated" : "Target"}
                  </span>
                  <span role="columnheader">
                    {form.isPWP ? "Sold" : "Achieved"}
                  </span>
                  <span role="columnheader">Remaining</span>
                </div>
                {[...keys].sort().map((key) => {
                  const [categoryId, type] = key.split("|");
                  const entered = base
                    .filter((row) => `${row.categoryId}|${row.type}` === key)
                    .reduce((sum, row) => sum + row.value, 0);
                  const used = usage.entries
                    .filter((row) => `${row.categoryId}|${row.type}` === key)
                    .reduce((sum, row) => sum + row.value, 0);
                  const bucket = coverage.buckets.find(bucket => bucket.categoryId === categoryId && bucket.type === type);
                  return (
                    <div role="row" key={key}>
                      <span role="cell">
                        {FY_CATEGORY_LABELS[categoryId]} ·{" "}
                        {type === "EOL" ? "EOL" : "Recycling"}
                      </span>
                      <span role="cell">{coverageQuantityText(form.isPWP ? entered : bucket?.target ?? null)}</span>
                      <span role="cell">{coverageQuantityText(form.isPWP ? used : bucket?.covered ?? null)}</span>
                      <span role="cell">
                        {coverageQuantityText(form.isPWP ? entered - used : bucket?.pending ?? null)}
                      </span>
                    </div>
                  );
                })}
                {!keys.size && (
                  <p className="fy-help">
                    Add a quantity to see the breakdown.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
