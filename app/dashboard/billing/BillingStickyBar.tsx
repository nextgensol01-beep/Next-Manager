"use client";
import { useEffect, useRef, useState } from "react";
import BillingTopControls from "./BillingTopControls";
import BillingSearchFilters from "./BillingSearchFilters";
import type {
  BillingSummary,
  BillingFilter,
  BillingFilterOption,
  BillingTab,
  ViewMode,
} from "./types";
import { formatCurrency } from "@/lib/utils";

interface BillingStickyBarProps {
  fy: string;
  onFyChange: (value: string) => void;
  activeTab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
  billingCount: number;
  advanceCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: BillingFilter;
  onStatusFilterChange: (value: BillingFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  filterOptions: BillingFilterOption[];
  billingSummary: BillingSummary;
  /** Controlled from page — true when scroll has passed the threshold */
  isSticky: boolean;
}

/**
 * Compact sticky bar.
 *
 * Uses position: FIXED (not sticky) because the scroll root is
 * #dashboard-scroll-area (<main>), a child element. CSS sticky on a
 * grandchild of the scroll root is unreliable across browsers — the bar
 * disappears when its parent's layout box ends.
 *
 * Fixed positioning anchors it to the viewport at top: 60px (TopBar height).
 * We detect the left/width of the scroll area so it lines up with the content
 * column even when a sidebar is present.
 *
 * CSS transitions only — no Framer Motion — to avoid spring lag on scroll.
 */
export default function BillingStickyBar({
  fy, onFyChange,
  activeTab, onTabChange,
  billingCount, advanceCount,
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  viewMode, onViewModeChange,
  filterOptions,
  billingSummary,
  isSticky,
}: BillingStickyBarProps) {
  // Track the content column's left offset + width so the fixed bar
  // stays aligned even when the sidebar opens/closes.
  const [rect, setRect] = useState({ left: 0, width: "100%" as string | number });
  const scrollAreaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("dashboard-scroll-area");
    scrollAreaRef.current = el;
    if (!el) return;

    function sync() {
      const r = el!.getBoundingClientRect();
      setRect({ left: r.left, width: r.width });
    }
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      aria-hidden={!isSticky}
      style={{
        position: "fixed",
        top: 60,           // TopBar height
        left: rect.left,
        width: rect.width,
        zIndex: 40,
        // Slide in from above; invisible & non-interactive when not sticky
        opacity: isSticky ? 1 : 0,
        transform: isSticky ? "translateY(0)" : "translateY(-10px)",
        pointerEvents: isSticky ? "auto" : "none",
        transition: "opacity 200ms ease, transform 220ms ease",
        // Pad to match dashboard-main padding (p-4 md:p-6)
        padding: "12px 16px 0",
      }}
    >
      <div className="overflow-hidden rounded-2xl border border-base bg-card/95 shadow-md backdrop-blur-xl">

        {/* Row 1: FY picker + tabs */}
        <div className="flex flex-wrap items-center gap-0 px-2 py-1.5 border-b border-soft bg-surface/10">
          <BillingTopControls
            fy={fy}
            onFyChange={onFyChange}
            activeTab={activeTab}
            onTabChange={onTabChange}
            billingCount={billingCount}
            advanceCount={advanceCount}
            compact
          />
        </div>

        {/* Row 2: compact stats chips */}
        {activeTab === "billing" && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-soft bg-surface/5 px-4 py-2 text-xs font-medium">
            <span className="text-default">
              {formatCurrency(billingSummary.totalBilled)}
              <span className="text-faint font-normal ml-1">billed</span>
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {formatCurrency(billingSummary.totalCollected)}
              <span className="text-faint font-normal ml-1">collected</span>
            </span>
            <span className="text-red-500 dark:text-red-400">
              {formatCurrency(billingSummary.totalPending)}
              <span className="text-faint font-normal ml-1">pending</span>
            </span>
            {billingSummary.overdueCount > 0 && (
              <span className="text-orange-600 dark:text-orange-400">
                {billingSummary.overdueCount}
                <span className="text-faint font-normal ml-1">overdue</span>
              </span>
            )}
            <span className="text-faint ml-auto">{billingSummary.collectionPct}% collected</span>
          </div>
        )}

        {/* Row 3: Search + filters (billing tab only) */}
        {activeTab === "billing" && (
          <BillingSearchFilters
            search={search}
            onSearchChange={onSearchChange}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            filterOptions={filterOptions}
            compact
          />
        )}
      </div>
    </div>
  );
}
