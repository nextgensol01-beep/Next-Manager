"use client";
/**
 * BillingSummaryStats
 *
 * Lives in NORMAL DOCUMENT FLOW between BillingTopControls (sticky, top:0)
 * and BillingSearchFilters (sticky, top: ~[FY bar height]).
 *
 * Has its OWN card border/shadow — visually independent from the controls.
 *
 * Scroll animation (driven by the parent's smoothProgress MotionValue):
 *   0.00 → 0.30  both rows fully visible, no movement
 *   0.30 → 0.72  upper row moves down + tilts (front of deck)
 *                lower row rises up (back of deck peeking out)
 *   0.72 → 1.00  whole section fades out and collapses via maxHeight
 */
import { motion, useReducedMotion, useTransform, type MotionStyle, type MotionValue } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Billing, BillingSummary } from "./types";

interface BillingSummaryStatsProps {
  billingSummary: BillingSummary;
  billings: Billing[];
  advanceClientCount: number;
  /** Spring-smoothed scroll progress 0→1 passed down from page */
  scrollProgress: MotionValue<number>;
  /** Reports the natural (un-animated) content height so the parent can
   *  offset the billing list and prevent it sliding under the search bar
   *  before the collapse animation finishes. */
  onContentHeightChange?: (height: number) => void;
}

export default function BillingSummaryStats({
  billingSummary,
  billings,
  advanceClientCount,
  scrollProgress,
  onContentHeightChange,
}: BillingSummaryStatsProps) {
  const prefersReduced = useReducedMotion();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(720);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const measure = () => {
      const h = Math.ceil(node.scrollHeight);
      setContentHeight(h);
      onContentHeightChange?.(h);
    };

    measure();
    window.addEventListener("resize", measure);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [billingSummary, billings.length, advanceClientCount]);

  // ── Section collapse — maxHeight so it actually removes layout space ───
  const sectionHeight = useTransform(scrollProgress, [0, 1], [contentHeight, 0]);
  const sectionOpacity = useTransform(scrollProgress, [0, 0.78, 1], [1, 0.72, 0]);
  const sectionMargin = useTransform(scrollProgress, [0, 1], [12, 0]);

  // ── Upper row (6 stat cards) — front of deck ───────────────────────────
  const upperY       = useTransform(scrollProgress, [0, 1], [0, -20]);
  const upperScale   = useTransform(scrollProgress, [0, 1], [1, 0.96]);
  const upperRotateX = useTransform(scrollProgress, [0, 1], [0, 2]);

  // ── Lower row (aging buckets) — back of deck ───────────────────────────
  const lowerY       = useTransform(scrollProgress, [0, 1], [0, -58]);
  const lowerScale   = useTransform(scrollProgress, [0, 1], [1, 0.92]);
  const lowerOpacity = useTransform(scrollProgress, [0.12, 0.72], [1, 0]);

  const statCards = [
    { label: "Total Billed",  value: formatCurrency(billingSummary.totalBilled),   sub: `${billings.length} records`,                                             Icon: FileText,    bg: "bg-blue-50 dark:bg-blue-900/25",    ic: "text-blue-600 dark:text-blue-300",    vc: "text-default" },
    { label: "Collected",     value: formatCurrency(billingSummary.totalCollected), sub: `${billingSummary.collectionPct}% rate`,                                  Icon: TrendingUp,  bg: "bg-emerald-50 dark:bg-emerald-900/25", ic: "text-emerald-600 dark:text-emerald-300", vc: "text-emerald-600 dark:text-emerald-400" },
    { label: "Pending",       value: formatCurrency(billingSummary.totalPending),   sub: `${billingSummary.pendingCount} need follow-up`,                          Icon: AlertCircle, bg: "bg-red-50 dark:bg-red-900/25",      ic: "text-red-500 dark:text-red-300",      vc: "text-red-500 dark:text-red-400" },
    { label: "Advance",       value: formatCurrency(billingSummary.totalAdvance),   sub: `${advanceClientCount} clients`,                                          Icon: Wallet,      bg: "bg-amber-50 dark:bg-amber-900/25",  ic: "text-amber-600 dark:text-amber-300",  vc: "text-amber-600 dark:text-amber-400" },
    { label: "Invoice Gap",   value: formatCurrency(billingSummary.invoiceGap),     sub: `${billings.filter(b => !b.invoiceCreated).length} without invoice`,      Icon: ReceiptText, bg: "bg-violet-50 dark:bg-violet-900/25", ic: "text-violet-600 dark:text-violet-300", vc: "text-violet-600 dark:text-violet-400" },
    { label: "Status Mix",    value: String(billingSummary.paidCount),              sub: `${billingSummary.partialCount} partial · ${billingSummary.unpaidCount} unpaid`, Icon: CheckCircle2, bg: "bg-teal-50 dark:bg-teal-900/25", ic: "text-teal-600 dark:text-teal-300",  vc: "text-default" },
  ];

  const agingBuckets = [
    { label: "Not Due",    amount: billingSummary.aging.notDue,      tone: "text-muted",                              bar: "bg-slate-300 dark:bg-slate-600" },
    { label: "0–30 Days",  amount: billingSummary.aging.days0To30,   tone: "text-amber-600 dark:text-amber-400",     bar: "bg-amber-400" },
    { label: "31–60 Days", amount: billingSummary.aging.days31To60,  tone: "text-orange-600 dark:text-orange-400",   bar: "bg-orange-500" },
    { label: "60+ Days",   amount: billingSummary.aging.days60Plus,  tone: "text-red-600 dark:text-red-400",         bar: "bg-red-500" },
  ];

  const StatCardGrid = () => (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
      {statCards.map(({ label, value, sub, Icon, bg, ic, vc }) => (
        <div key={label} className="bg-card border border-base rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[11px] font-medium text-faint uppercase tracking-wide leading-tight">{label}</p>
            <div className={`w-7 h-7 rounded-lg ${bg} ${ic} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-bold ${vc} leading-none`}>{value}</p>
          <p className="text-[11px] text-faint mt-1.5">{sub}</p>
        </div>
      ))}
    </div>
  );

  const AgingGrid = ({ motionStyle }: { motionStyle?: MotionStyle }) => (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      style={motionStyle}
    >
      {agingBuckets.map((b) => {
        const pct = Math.round((b.amount / (billingSummary.totalPending || 1)) * 100);
        return (
          <div key={b.label} className="rounded-xl border border-base bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-faint">{b.label}</p>
              <p className={`text-xs font-medium ${b.tone}`}>{pct}%</p>
            </div>
            <p className={`text-base font-bold ${b.tone}`}>{formatCurrency(b.amount)}</p>
            <div className="w-full bg-surface rounded-full h-1 mt-2">
              <div className={`h-1 rounded-full ${b.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </motion.div>
  );

  // ── Reduced-motion: static, no animation ──────────────────────────────
  if (prefersReduced) {
    return (
      <div className="mb-3" style={{ perspective: "1100px" }}>
        <StatCardGrid />
        <AgingGrid />
      </div>
    );
  }

  // ── Full animation ─────────────────────────────────────────────────────
  return (
    <motion.div
      className="mb-3 origin-top"
      style={{
        height: sectionHeight,
        opacity:   sectionOpacity,
        overflow:  "hidden",
        marginBottom: sectionMargin,
        perspective: "1100px",
      }}
    >
      <div ref={contentRef}>
      {/* Upper row — moves forward / down (front of deck) */}
      <motion.div
        className="origin-top"
        style={{ y: upperY, scale: upperScale, rotateX: upperRotateX, zIndex: 1, position: "relative", transformStyle: "preserve-3d" }}
      >
        <StatCardGrid />
      </motion.div>

      {/* Lower row — rises up (back of deck peeking out) */}
      <AgingGrid
        motionStyle={{ y: lowerY, scale: lowerScale, opacity: lowerOpacity, position: "relative" }}
      />
      </div>
    </motion.div>
  );
}
