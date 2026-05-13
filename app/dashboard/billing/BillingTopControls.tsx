"use client";

import { useEffect, useRef } from "react";
import { FileText, Wallet } from "lucide-react";
import FYTabBar from "@/components/ui/FYTabBar";
import type { BillingTab } from "./types";

interface BillingTopControlsProps {
  fy: string;
  onFyChange: (value: string) => void;
  activeTab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
  billingCount: number;
  advanceCount: number;
  onHeightChange?: (height: number) => void;
  merged?: boolean;
  sticky?: boolean;
  compact?: boolean;
}

/**
 * FY picker + tab switcher.
 * Sits sticky at top:0 inside the scroll container.
 * Plain CSS — no animation, no scroll coupling.
 */
export default function BillingTopControls({
  fy,
  onFyChange,
  activeTab,
  onTabChange,
  billingCount,
  advanceCount,
  onHeightChange,
  merged = false,
  sticky = true,
}: BillingTopControlsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabs = [
    { value: "billing"  as BillingTab, label: "Billing Records",  count: billingCount,  Icon: FileText },
    { value: "advances" as BillingTab, label: "Advance Payments", count: advanceCount,  Icon: Wallet   },
  ];

  useEffect(() => {
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
    <div
      ref={containerRef}
      className={`overflow-hidden border border-base bg-card/95 shadow-sm backdrop-blur-xl transition-[border-radius,margin] duration-200 ${
        merged ? "mb-0 rounded-t-2xl rounded-b-none" : "mb-3 rounded-2xl"
      }`}
      style={sticky ? { position: "sticky", top: 0, zIndex: 32 } : undefined}
    >
      {/* Row 1 — FY picker */}
      <div className="px-1 py-1">
        <FYTabBar value={fy} onChange={onFyChange} />
      </div>

      {/* Row 2 — tab buttons */}
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
    </div>
  );
}
