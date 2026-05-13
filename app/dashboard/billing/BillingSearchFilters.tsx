"use client";
import React from "react";
import { motion } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { LayoutGrid, LayoutList, Search, X } from "lucide-react";
import type { BillingFilter, BillingFilterOption, ViewMode } from "./types";

interface BillingSearchFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: BillingFilter;
  onStatusFilterChange: (value: BillingFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  filterOptions: BillingFilterOption[];
  merged?: boolean;
  onHeightChange?: (height: number) => void;
  sticky?: boolean;
  compact?: boolean;
  /**
   * px offset from top of scroll container (static portion).
   * Pass the measured height of BillingTopControls so this bar
   * sticks immediately below it.  Defaults to 88 (approx FY+tabs height).
   */
  stickyTop?: number;
  /**
   * Animated additional offset (MotionValue<number>) equal to the current
   * rendered height of BillingSummaryStats. The search bar sticks at
   * stickyTop + stickyTopOffset, tracking the stats bottom during collapse.
   */
  stickyTopOffset?: MotionValue<number>;
}

/**
 * Search + filter chips.
 * Sits sticky at `top: stickyTop` — just below BillingTopControls.
 * Its own independent card so stats can live freely between them.
 */
export default function BillingSearchFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  filterOptions,
  merged = false,
  onHeightChange,
  sticky = true,
  stickyTop = 88,
  stickyTopOffset,
}: BillingSearchFiltersProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || !onHeightChange) return;

    const measure = () => {
      onHeightChange(Math.ceil(node.getBoundingClientRect().height));
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
  }, [onHeightChange]);

  return (
    <motion.div
      ref={containerRef as React.Ref<HTMLDivElement>}
      className={`mb-3 overflow-hidden border border-base bg-card/95 shadow-sm backdrop-blur-xl transition-[border-radius,border-color] duration-200 ${
        merged ? "rounded-t-none rounded-b-2xl border-t-0" : "rounded-2xl"
      }`}
      style={
        sticky
          ? {
              position: "sticky",
              // stickyTopOffset is a MotionValue<number> containing
              // topControlsHeight + animated stats height. When present,
              // framer-motion drives `top` directly without React re-renders,
              // so the bar smoothly tracks the collapsing stats section.
              top: stickyTopOffset ?? stickyTop,
              zIndex: 31,
            }
          : undefined
      }
    >
      {/* Search row */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2 border-b border-soft bg-surface/10">
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
    </motion.div>
  );
}
