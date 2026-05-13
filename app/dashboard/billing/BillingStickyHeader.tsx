"use client";
/**
 * BillingStickyHeader
 *
 * A single sticky card at top:0 that contains all three header layers:
 *
 *   Row 1 — FY picker          (always visible)
 *   Row 2 — Billing / Advance tabs  (always visible)
 *   Row 3 — Stats cards + aging    (collapses on scroll)
 *   Row 4 — Search + filter chips  (always visible)
 *
 * Because everything lives inside one card the search bar can never
 * overlap the controls — it is always the bottom border of the same
 * element.  No ResizeObserver, no stickyTop measurement needed.
 *
 * Scroll animation (driven by smoothProgress MotionValue 0→1):
 *   0.00 → 0.25  stats fully visible, no movement
 *   0.25 → 0.72  upper row slides forward / lower row rises (deck split)
 *   0.55 → 0.95  whole stats section fades out
 *   0.72 → 1.00  maxHeight + marginBottom collapse to zero
 */
import React from "react";
import {
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  LayoutGrid,
  LayoutList,
  ReceiptText,
  Search,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import FYTabBar from "@/components/ui/FYTabBar";
import { formatCurrency } from "@/lib/utils";
import type {
  Billing,
  BillingFilter,
  BillingFilterOption,
  BillingSummary,
  BillingTab,
  ViewMode,
} from "./types";

interface BillingStickyHeaderProps {
  // ── FY + tabs ──────────────────────────────────────────────
  fy: string;
  onFyChange: (value: string) => void;
  activeTab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
  billingCount: number;
  advanceCount: number;

  // ── Stats (only shown when activeTab === "billing") ────────
  billingSummary: BillingSummary;
  billings: Billing[];
  advanceClientCount: number;
  /** Spring-smoothed scroll progress 0→1 from page */
  scrollProgress: MotionValue<number>;

  // ── Search + filters ───────────────────────────────────────
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: BillingFilter;
  onStatusFilterChange: (value: BillingFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  filterOptions: BillingFilterOption[];
}

export default function BillingStickyHeader({
  fy,
  onFyChange,
  activeTab,
  onTabChange,
  billingCount,
  advanceCount,
  billingSummary,
  billings,
  advanceClientCount,
  scrollProgress,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  filterOptions,
}: BillingStickyHeaderProps) {
  const prefersReduced = useReducedMotion();

  const tabs = [
    { value: "billing"  as BillingTab, label: "Billing Records",  count: billingCount,  Icon: FileText },
    { value: "advances" as BillingTab, label: "Advance Payments", count: advanceCount,  Icon: Wallet   },
  ];

  // ── Stats animation values ────────────────────────────────────────────────

  // Section wrapper: collapses height and fades out
  const sectionMaxHeight = useTransform(scrollProgress, [0, 1],     [400, 0]);
  const sectionOpacity   = useTransform(scrollProgress, [0.55, 0.95], [1, 0]);
  const sectionMargin    = useTransform(scrollProgress, [0.72, 1],   [0, 0]); // no external margin needed

  // Upper row (stat cards) — front of deck
  const upperY       = useTransform(scrollProgress, [0.25, 0.72], [0, 22]);
  const upperScale   = useTransform(scrollProgress, [0.25, 0.72], [1, 0.968]);
  const upperRotateX = useTransform(scrollProgress, [0.25, 0.72], [0, 1.4]);

  // Lower row (aging) — back of deck
  const lowerY       = useTransform(scrollProgress, [0.25, 0.72], [0, -34]);
  const lowerScale   = useTransform(scrollProgress, [0.25, 0.72], [1, 0.93]);
  const lowerOpacity = useTransform(scrollProgress, [0.20, 0.58],  [1, 0]);

  // ── Data for stats ─────────────────────────────────────────────────────────
  const statCards = [
    { label: "Total Billed",  value: formatCurrency(billingSummary.totalBilled),   sub: `${billings.length} records`,                                              Icon: FileText,    bg: "bg-blue-50 dark:bg-blue-900/25",     ic: "text-blue-600 dark:text-blue-300",      vc: "text-default" },
    { label: "Collected",     value: formatCurrency(billingSummary.totalCollected), sub: `${billingSummary.collectionPct}% rate`,                                   Icon: TrendingUp,  bg: "bg-emerald-50 dark:bg-emerald-900/25", ic: "text-emerald-600 dark:text-emerald-300", vc: "text-emerald-600 dark:text-emerald-400" },
    { label: "Pending",       value: formatCurrency(billingSummary.totalPending),   sub: `${billingSummary.pendingCount} need follow-up`,                           Icon: AlertCircle, bg: "bg-red-50 dark:bg-red-900/25",       ic: "text-red-500 dark:text-red-300",        vc: "text-red-500 dark:text-red-400" },
    { label: "Advance",       value: formatCurrency(billingSummary.totalAdvance),   sub: `${advanceClientCount} clients`,                                           Icon: Wallet,      bg: "bg-amber-50 dark:bg-amber-900/25",   ic: "text-amber-600 dark:text-amber-300",    vc: "text-amber-600 dark:text-amber-400" },
    { label: "Invoice Gap",   value: formatCurrency(billingSummary.invoiceGap),     sub: `${billings.filter(b => !b.invoiceCreated).length} without invoice`,       Icon: ReceiptText, bg: "bg-violet-50 dark:bg-violet-900/25", ic: "text-violet-600 dark:text-violet-300",  vc: "text-violet-600 dark:text-violet-400" },
    { label: "Status Mix",    value: String(billingSummary.paidCount),              sub: `${billingSummary.partialCount} partial · ${billingSummary.unpaidCount} unpaid`, Icon: CheckCircle2, bg: "bg-teal-50 dark:bg-teal-900/25", ic: "text-teal-600 dark:text-teal-300",    vc: "text-default" },
  ];

  const agingBuckets = [
    { label: "Not Due",    amount: billingSummary.aging.notDue,     tone: "text-muted",                              bar: "bg-slate-300 dark:bg-slate-600" },
    { label: "0–30 Days",  amount: billingSummary.aging.days0To30,  tone: "text-amber-600 dark:text-amber-400",      bar: "bg-amber-400" },
    { label: "31–60 Days", amount: billingSummary.aging.days31To60, tone: "text-orange-600 dark:text-orange-400",    bar: "bg-orange-500" },
    { label: "60+ Days",   amount: billingSummary.aging.days60Plus, tone: "text-red-600 dark:text-red-400",          bar: "bg-red-500" },
  ];

  // ── Sub-components ─────────────────────────────────────────────────────────
  const StatCardGrid = () => (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
      {statCards.map(({ label, value, sub, Icon, bg, ic, vc }) => (
        <div key={label} className="bg-surface rounded-xl p-3 border border-soft">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-[11px] font-medium text-faint uppercase tracking-wide leading-tight">{label}</p>
            <div className={`w-6 h-6 rounded-lg ${bg} ${ic} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-3 h-3" />
            </div>
          </div>
          <p className={`text-lg font-bold ${vc} leading-none`}>{value}</p>
          <p className="text-[11px] text-faint mt-1">{sub}</p>
        </div>
      ))}
    </div>
  );

  const AgingRow = ({ motionStyle }: { motionStyle?: React.CSSProperties }) => (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      style={motionStyle}
    >
      {agingBuckets.map((b) => {
        const pct = Math.round((b.amount / (billingSummary.totalPending || 1)) * 100);
        return (
          <div key={b.label} className="rounded-xl border border-soft bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-faint">{b.label}</p>
              <p className={`text-xs font-medium ${b.tone}`}>{pct}%</p>
            </div>
            <p className={`text-sm font-bold ${b.tone}`}>{formatCurrency(b.amount)}</p>
            <div className="w-full bg-card rounded-full h-1 mt-2">
              <div className={`h-1 rounded-full ${b.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </motion.div>
  );

  return (
    <div
      className="mb-4 overflow-hidden rounded-2xl border border-base bg-card/95 shadow-sm backdrop-blur-xl"
      style={{ position: "sticky", top: 0, zIndex: 32 }}
    >
      {/* ── Row 1: FY picker ─────────────────────────────────────────────── */}
      <div className="px-1 py-1">
        <FYTabBar value={fy} onChange={onFyChange} />
      </div>

      {/* ── Row 2: Billing / Advance tabs ────────────────────────────────── */}
      <div className="border-t border-soft bg-surface/20">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {tabs.map(({ value, label, count, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === value
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                  : "text-muted hover:bg-surface hover:text-default"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                activeTab === value
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-800/70 dark:text-brand-100"
                  : "bg-surface border border-base text-faint"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Row 3: Stats — collapses on scroll (billing tab only) ────────── */}
      {activeTab === "billing" && (
        prefersReduced ? (
          <div className="px-3 pt-3 border-t border-soft" style={{ perspective: "1100px" }}>
            <StatCardGrid />
            <AgingRow />
          </div>
        ) : (
          <motion.div
            className="px-3 pt-3 border-t border-soft origin-top"
            style={{
              maxHeight: sectionMaxHeight,
              opacity: sectionOpacity,
              overflow: "hidden",
              marginBottom: sectionMargin,
              perspective: "1100px",
            }}
          >
            {/* Upper row — front of deck */}
            <motion.div
              className="origin-top"
              style={{ y: upperY, scale: upperScale, rotateX: upperRotateX, zIndex: 1, position: "relative" }}
            >
              <StatCardGrid />
            </motion.div>

            {/* Lower row — back of deck */}
            <AgingRow
              motionStyle={{ y: lowerY, scale: lowerScale, opacity: lowerOpacity, position: "relative" }}
            />
          </motion.div>
        )
      )}

      {/* ── Row 4: Search + filter chips ─────────────────────────────────── */}
      {activeTab === "billing" && (
        <>
          {/* Search row */}
          <div className="flex min-w-0 items-center gap-2 px-3 py-2 border-t border-soft bg-surface/10">
            <Search className="w-4 h-4 flex-shrink-0 text-faint" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-default outline-none ring-0 placeholder:text-faint"
              placeholder="Search by client name, ID, or status..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {search && (
              <button
                onClick={() => onSearchChange("")}
                className="rounded p-1 text-faint transition-colors hover:text-default"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="ml-1 flex items-center gap-1 border-l border-soft pl-2">
              <button
                onClick={() => onViewModeChange("cards")}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === "cards"
                    ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300"
                    : "text-faint hover:text-muted"
                }`}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange("table")}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === "table"
                    ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300"
                    : "text-faint hover:text-muted"
                }`}
                title="Table view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter chips row */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
            {filterOptions.map((opt) => (
              <React.Fragment key={opt.value}>
                {opt.separator && (
                  <span className="hidden h-5 w-px flex-shrink-0 bg-border-soft sm:block" />
                )}
                <button
                  type="button"
                  onClick={() => onStatusFilterChange(opt.value)}
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    statusFilter === opt.value
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-300"
                      : "border-base bg-transparent text-muted hover:border-soft hover:text-default"
                  }`}
                >
                  {opt.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    statusFilter === opt.value
                      ? "bg-brand-100 text-brand-600 dark:bg-brand-800/60 dark:text-brand-200"
                      : "border border-base bg-surface text-faint"
                  }`}>
                    {opt.count}
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
