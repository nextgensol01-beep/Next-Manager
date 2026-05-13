/**
 * BillingControlBar
 *
 * Replaces BillingTopControls + BillingSearchFilters with a single component
 * that has two rendering modes:
 *
 *  isSticky=false  → expanded layout (same visual as before, two separate blocks)
 *  isSticky=true   → compact single sticky bar (all controls merged into one row)
 *
 * Zero billing logic changes. All props are identical to what page.tsx
 * was already passing to the two old components.
 */
"use client";
import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  LayoutGrid,
  LayoutList,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";
import FYTabBar from "@/components/ui/FYTabBar";
import type { BillingFilter, BillingFilterOption, BillingTab, ViewMode } from "./types";

interface BillingControlBarProps {
  // ── FY + Tabs (was BillingTopControls) ──────────────────────────────────
  fy: string;
  onFyChange: (value: string) => void;
  activeTab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
  billingCount: number;
  advanceCount: number;
  // ── Search + Filters (was BillingSearchFilters) ──────────────────────────
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: BillingFilter;
  onStatusFilterChange: (value: BillingFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  filterOptions: BillingFilterOption[];
  // ── Actions ──────────────────────────────────────────────────────────────
  onAddBilling: () => void;
  onRecordAdvance: () => void;
  // ── Sticky mode ──────────────────────────────────────────────────────────
  /** When true the component renders as one compact sticky bar */
  isSticky: boolean;
}

const TABS = [
  { value: "billing"  as BillingTab, label: "Billing Records",   shortLabel: "Billing",  icon: FileText },
  { value: "advances" as BillingTab, label: "Advance Payments",  shortLabel: "Advances", icon: Wallet  },
];

export default function BillingControlBar({
  fy, onFyChange,
  activeTab, onTabChange, billingCount, advanceCount,
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  viewMode, onViewModeChange,
  filterOptions,
  onAddBilling, onRecordAdvance,
  isSticky,
}: BillingControlBarProps) {
  const prefersReducedMotion = useReducedMotion();
  const showSearchFilters = activeTab === "billing";

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  EXPANDED  (isSticky=false) — identical look to the original two bars
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!isSticky) {
    return (
      <div className="mb-3 space-y-3">
        {/* ── FY + Tabs block (was BillingTopControls) ── */}
        <div className="sticky top-0 z-40 overflow-hidden rounded-2xl border border-base bg-card/90 shadow-sm backdrop-blur-xl">
          <div className="px-1 py-1">
            <FYTabBar value={fy} onChange={onFyChange} />
          </div>
          <div className="border-t border-soft bg-surface/20">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const count = tab.value === "billing" ? billingCount : advanceCount;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => onTabChange(tab.value)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                      activeTab === tab.value
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : "text-muted hover:bg-surface hover:text-default"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      activeTab === tab.value
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-800/70 dark:text-brand-100"
                        : "bg-surface border border-base text-faint"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Search + Filters block (was BillingSearchFilters) — billing tab only ── */}
        {showSearchFilters && (
          <div className="sticky top-[128px] z-30 overflow-hidden rounded-2xl border border-base bg-card/90 shadow-sm backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-2 border-b border-soft bg-surface/20 px-3 py-2">
              <Search className="w-4 h-4 flex-shrink-0 text-faint" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-default outline-none ring-0 placeholder:text-faint"
                placeholder="Search by client name, ID, or status..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button onClick={() => onSearchChange("")} className="rounded p-1 text-faint transition-colors hover:text-default">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="ml-1 flex items-center gap-1 border-l border-soft pl-2">
                <button
                  onClick={() => onViewModeChange("cards")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "cards" ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300" : "text-faint hover:text-muted"}`}
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onViewModeChange("table")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300" : "text-faint hover:text-muted"}`}
                  title="Table view"
                >
                  <LayoutList className="w-4 h-4" />
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
          </div>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  COMPACT STICKY BAR  (isSticky=true) — one merged bar, top-0
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <motion.div
      key="compact-bar"
      initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="sticky top-0 z-40 mb-4"
    >
      <div className="overflow-hidden rounded-2xl border border-base bg-card/93 shadow-md backdrop-blur-xl">

        {/* ── DESKTOP: single horizontal row ──────────────────────────────── */}
        <div className="hidden md:flex items-stretch divide-x divide-soft min-h-0">

          {/* FY selector */}
          <div className="flex-shrink-0 flex items-center px-1 py-1">
            <FYTabBar value={fy} onChange={onFyChange} />
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-0.5 px-2 py-1.5 flex-shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const count = tab.value === "billing" ? billingCount : advanceCount;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onTabChange(tab.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    activeTab === tab.value
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                      : "text-muted hover:bg-surface hover:text-default"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{tab.label}</span>
                  <span className="lg:hidden">{tab.shortLabel}</span>
                  <span className={`rounded-full px-1.5 py-0 text-[10px] leading-5 ${
                    activeTab === tab.value
                      ? "bg-brand-100 text-brand-600 dark:bg-brand-800/60 dark:text-brand-200"
                      : "bg-surface border border-base text-faint"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search — grows to fill */}
          {showSearchFilters && (
            <div className="flex flex-1 min-w-0 items-center gap-2 px-3 py-1.5">
              <Search className="w-3.5 h-3.5 flex-shrink-0 text-faint" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-xs text-default outline-none ring-0 placeholder:text-faint"
                placeholder="Search clients..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button onClick={() => onSearchChange("")} className="rounded p-0.5 text-faint hover:text-default transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Filter chips — horizontally scrollable, capped width */}
          {showSearchFilters && (
            <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 flex-shrink-0 max-w-xs xl:max-w-md">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onStatusFilterChange(opt.value)}
                  className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    statusFilter === opt.value
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-300"
                      : "border-base bg-transparent text-muted hover:border-soft hover:text-default"
                  }`}
                >
                  {opt.label}
                  <span className={`rounded-full px-1 text-[9px] leading-4 ${
                    statusFilter === opt.value
                      ? "bg-brand-100 text-brand-600 dark:bg-brand-800/60 dark:text-brand-200"
                      : "border border-base bg-surface text-faint"
                  }`}>
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* View toggle + Action buttons */}
          <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0">
            {showSearchFilters && (
              <>
                <button
                  onClick={() => onViewModeChange("cards")}
                  className={`p-1 rounded-lg transition-colors ${viewMode === "cards" ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300" : "text-faint hover:text-muted"}`}
                  title="Card view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onViewModeChange("table")}
                  className={`p-1 rounded-lg transition-colors ${viewMode === "table" ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300" : "text-faint hover:text-muted"}`}
                  title="Table view"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                </button>
                <span className="w-px h-4 bg-soft mx-1 flex-shrink-0" />
              </>
            )}
            <button
              onClick={onRecordAdvance}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted hover:bg-surface hover:text-default transition-colors flex-shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden lg:inline">Advance</span>
            </button>
            <button
              onClick={onAddBilling}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors flex-shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>Add Billing</span>
            </button>
          </div>
        </div>

        {/* ── MOBILE: stacked compact rows ────────────────────────────────── */}
        <div className="flex flex-col md:hidden">

          {/* Row 1: FY + Tabs + Add button */}
          <div className="flex items-center gap-1 px-1 py-1 border-b border-soft">
            <div className="flex-shrink-0 min-w-0 overflow-hidden">
              <FYTabBar value={fy} onChange={onFyChange} />
            </div>
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => onTabChange(tab.value)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                      activeTab === tab.value
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : "text-muted hover:bg-surface"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.shortLabel}
                  </button>
                );
              })}
              <button
                onClick={onAddBilling}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 px-2 py-1 text-[11px] font-semibold text-white transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </div>

          {/* Row 2: Search + view toggle (billing tab only) */}
          {showSearchFilters && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-soft">
              <Search className="w-3.5 h-3.5 flex-shrink-0 text-faint" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-xs text-default outline-none ring-0 placeholder:text-faint"
                placeholder="Search clients..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button onClick={() => onSearchChange("")} className="rounded p-0.5 text-faint hover:text-default">
                  <X className="w-3 h-3" />
                </button>
              )}
              <span className="w-px h-4 bg-soft flex-shrink-0" />
              <button
                onClick={() => onViewModeChange("cards")}
                className={`p-1 rounded transition-colors ${viewMode === "cards" ? "text-brand-600 dark:text-brand-300" : "text-faint"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange("table")}
                className={`p-1 rounded transition-colors ${viewMode === "table" ? "text-brand-600 dark:text-brand-300" : "text-faint"}`}
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Row 3: Filter chips (billing tab only) */}
          {showSearchFilters && (
            <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onStatusFilterChange(opt.value)}
                  className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    statusFilter === opt.value
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-300"
                      : "border-base bg-transparent text-muted"
                  }`}
                >
                  {opt.label}
                  <span className={`rounded-full px-1 text-[9px] leading-4 ${
                    statusFilter === opt.value
                      ? "bg-brand-100 text-brand-600 dark:bg-brand-800/60 dark:text-brand-200"
                      : "bg-surface text-faint"
                  }`}>
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
