import React, { useEffect, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
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
import type { Billing, BillingFilter, BillingFilterOption, BillingSummary, BillingTab, ViewMode } from "./types";

interface BillingScrollHeaderProps {
  fy: string;
  onFyChange: (value: string) => void;
  activeTab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
  billingCount: number;
  advanceCount: number;
  billingSummary: BillingSummary;
  billings: Billing[];
  advanceClientCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: BillingFilter;
  onStatusFilterChange: (value: BillingFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  filterOptions: BillingFilterOption[];
}

export default function BillingScrollHeader({
  fy,
  onFyChange,
  activeTab,
  onTabChange,
  billingCount,
  advanceCount,
  billingSummary,
  billings,
  advanceClientCount,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  filterOptions,
}: BillingScrollHeaderProps) {
  const [isWideViewport, setIsWideViewport] = useState(true);
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const input = [0, 220];
  const compactStatsMaxHeight = isWideViewport ? 42 : 150;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWideViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const statsMaxHeight = useTransform(scrollY, input, [420, compactStatsMaxHeight]);
  const statsGap = useTransform(scrollY, input, [12, 6]);
  const cardPadding = useTransform(scrollY, input, [16, 8]);
  const cardMinHeight = useTransform(scrollY, input, [104, 38]);
  const iconBox = useTransform(scrollY, input, [28, 16]);
  const iconOpacity = useTransform(scrollY, input, [1, 0.24]);
  const labelOpacity = useTransform(scrollY, [0, 150, 220], [1, 0.55, 0.22]);
  const labelScale = useTransform(scrollY, input, [1, 0.86]);
  const numberSize = useTransform(scrollY, input, [20, 12]);
  const detailOpacity = useTransform(scrollY, [0, 120, 220], [1, 0.2, 0]);
  const detailHeight = useTransform(scrollY, input, [15, 0]);
  const agingHeight = useTransform(scrollY, input, [76, 0]);
  const agingOpacity = useTransform(scrollY, [0, 150, 220], [1, 0.24, 0]);
  const agingMargin = useTransform(scrollY, input, [16, 0]);

  const reduce = Boolean(prefersReducedMotion);
  const stats = [
    {
      label: "Total Billed",
      value: formatCurrency(billingSummary.totalBilled),
      detail: `${billings.length} records`,
      icon: FileText,
      tone: "text-default",
      iconTone: "bg-blue-50 dark:bg-blue-900/25 text-blue-600 dark:text-blue-300",
    },
    {
      label: "Collected",
      value: formatCurrency(billingSummary.totalCollected),
      detail: `${billingSummary.collectionPct}% rate`,
      icon: TrendingUp,
      tone: "text-emerald-600 dark:text-emerald-400",
      iconTone: "bg-emerald-50 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-300",
    },
    {
      label: "Pending",
      value: formatCurrency(billingSummary.totalPending),
      detail: `${billingSummary.pendingCount} need follow-up`,
      icon: AlertCircle,
      tone: "text-red-500 dark:text-red-400",
      iconTone: "bg-red-50 dark:bg-red-900/25 text-red-500 dark:text-red-300",
    },
    {
      label: "Advance",
      value: formatCurrency(billingSummary.totalAdvance),
      detail: `${advanceClientCount} clients`,
      icon: Wallet,
      tone: "text-amber-600 dark:text-amber-400",
      iconTone: "bg-amber-50 dark:bg-amber-900/25 text-amber-600 dark:text-amber-300",
    },
    {
      label: "Invoice Gap",
      value: formatCurrency(billingSummary.invoiceGap),
      detail: `${billings.filter((b) => !b.invoiceCreated).length} without invoice`,
      icon: ReceiptText,
      tone: "text-violet-600 dark:text-violet-400",
      iconTone: "bg-violet-50 dark:bg-violet-900/25 text-violet-600 dark:text-violet-300",
    },
    {
      label: "Status Mix",
      value: String(billingSummary.paidCount),
      detail: `${billingSummary.partialCount} partial · ${billingSummary.unpaidCount} unpaid`,
      icon: CheckCircle2,
      tone: "text-default",
      iconTone: "bg-teal-50 dark:bg-teal-900/25 text-teal-600 dark:text-teal-300",
    },
  ];

  return (
    <div className="sticky top-0 z-40 mb-4">
      <div className="rounded-2xl border border-base bg-card/90 shadow-sm shadow-black/10 backdrop-blur-xl">
        <div className="px-1 py-1">
          <FYTabBar value={fy} onChange={onFyChange} />
        </div>

        <div className="border-t border-soft bg-surface/20">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            {[
              { value: "billing" as BillingTab, label: "Billing Records", count: billingCount, icon: FileText },
              { value: "advances" as BillingTab, label: "Advance Payments", count: advanceCount, icon: Wallet },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onTabChange(tab.value)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === tab.value
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                      : "text-muted hover:bg-surface hover:text-default"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeTab === tab.value ? "bg-brand-100 text-brand-700 dark:bg-brand-800/70 dark:text-brand-100" : "bg-surface border border-base text-faint"}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-3">
            <motion.div className="min-w-0 overflow-hidden" style={reduce ? undefined : { maxHeight: statsMaxHeight }}>
              <motion.div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" style={reduce ? undefined : { gap: statsGap }}>
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div
                      key={stat.label}
                      layout
                      className="min-w-0 rounded-xl border border-base bg-card/70 shadow-sm"
                      style={reduce ? undefined : { padding: cardPadding, minHeight: cardMinHeight }}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <motion.p
                          className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-faint"
                          style={reduce ? undefined : { opacity: labelOpacity, scale: labelScale, transformOrigin: "left center" }}
                        >
                          {stat.label}
                        </motion.p>
                        <motion.div
                          className={`flex flex-shrink-0 items-center justify-center rounded-lg ${stat.iconTone}`}
                          style={reduce ? undefined : { width: iconBox, height: iconBox, opacity: iconOpacity }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </motion.div>
                      </div>
                      <motion.p
                        className={`mt-1 truncate font-bold leading-none ${stat.tone}`}
                        style={reduce ? undefined : { fontSize: numberSize }}
                      >
                        {stat.value}
                      </motion.p>
                      <motion.p
                        className="mt-1.5 overflow-hidden truncate text-[11px] text-faint"
                        style={reduce ? undefined : { opacity: detailOpacity, height: detailHeight }}
                      >
                        {stat.detail}
                      </motion.p>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          </div>

          <motion.div className="overflow-hidden px-3" style={reduce ? undefined : { height: agingHeight, opacity: agingOpacity, marginBottom: agingMargin }}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Not Due", amount: billingSummary.aging.notDue, tone: "text-muted", bar: "bg-slate-300 dark:bg-slate-600" },
                { label: "0-30 Days", amount: billingSummary.aging.days0To30, tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-400" },
                { label: "31-60 Days", amount: billingSummary.aging.days31To60, tone: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" },
                { label: "60+ Days", amount: billingSummary.aging.days60Plus, tone: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
              ].map((bucket) => {
                const total = billingSummary.totalPending || 1;
                const pct = Math.round((bucket.amount / total) * 100);
                return (
                  <div key={bucket.label} className="rounded-xl border border-base bg-card px-4 py-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium text-faint">{bucket.label}</p>
                      <p className={`text-xs font-medium ${bucket.tone}`}>{pct}%</p>
                    </div>
                    <p className={`text-base font-bold ${bucket.tone}`}>{formatCurrency(bucket.amount)}</p>
                    <div className="mt-2 h-1 w-full rounded-full bg-surface">
                      <div className={`h-1 rounded-full ${bucket.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <div className="border-t border-soft">
            <div className="flex min-w-0 items-center gap-2 border-b border-soft bg-surface/20 px-3 py-2">
              <Search className="h-4 w-4 flex-shrink-0 text-faint" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-default outline-none ring-0 placeholder:text-faint"
                placeholder="Search by client name, ID, or status..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button onClick={() => onSearchChange("")} className="rounded p-1 text-faint transition-colors hover:text-default">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="ml-1 flex items-center gap-1 border-l border-soft pl-2">
                <button
                  onClick={() => onViewModeChange("cards")}
                  className={`rounded-lg p-1.5 transition-colors ${viewMode === "cards" ? "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300" : "text-faint hover:text-muted"}`}
                  title="Card view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onViewModeChange("table")}
                  className={`rounded-lg p-1.5 transition-colors ${viewMode === "table" ? "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300" : "text-faint hover:text-muted"}`}
                  title="Table view"
                >
                  <LayoutList className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
              {filterOptions.map((opt) => (
                <React.Fragment key={opt.value}>
                  {opt.separator && <span className="hidden h-5 w-px flex-shrink-0 bg-border-soft sm:block" />}
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
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusFilter === opt.value ? "bg-brand-100 text-brand-600 dark:bg-brand-800/60 dark:text-brand-200" : "border border-base bg-surface text-faint"}`}>
                      {opt.count}
                    </span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
