"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from "framer-motion";
import {
  ArrowRight,
  Leaf,
  Pencil,
  Recycle,
  Search,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";
import type { Client, FYRecord } from "./FinancialYearSupport";
import {
  CAT_DISPLAY,
  CAT_IDS,
  CREDIT_TYPES,
  GROUP_LABELS,
  METRIC_LABELS,
  PIBO_CATEGORIES,
  buildFinancialYearInsights,
  formatInsightNumber,
  getProgress,
  getRowsForMetric,
  type ClientGroup,
  type FinancialYearInsights,
  type GroupSummary,
  type InsightClientRow,
  type InsightStats,
  type MetricKey,
  type MetricSet,
} from "./financialYearInsights";

type SortKey = MetricKey | "name";
type MetricPillRect = { left: number; top: number; width: number; height: number };
type MetricPillEdges = { left: number; right: number; top: number; bottom: number };

const METRIC_ORDER: MetricKey[] = ["base", "used", "remaining", "excess"];
const METRIC_LEAD_SPRING = { stiffness: 580, damping: 28, mass: 0.6 };
const METRIC_TRAIL_SPRING = { stiffness: 260, damping: 26, mass: 1.5 };
const METRIC_AXIS_SPRING = { stiffness: 580, damping: 30, mass: 0.6 };
const METRIC_SQUASH_SPRING = { stiffness: 420, damping: 22, mass: 0.5 };
const METRIC_REDUCED_SPRING = { stiffness: 300, damping: 40, mass: 1 };
const METRIC_RECT_EPSILON = 0.5;

const GROUP_DESCRIPTIONS: Record<ClientGroup, string> = {
  pibo: "Producer, Importer, and Brand Owner target demand for the selected financial year.",
  pwp: "PWP credit supply, sold movement, availability, and oversold pressure.",
};

const GROUP_ACCENT: Record<ClientGroup, {
  icon: React.ReactNode;
  text: string;
  progress: string;
}> = {
  pibo: {
    icon: <Target className="h-5 w-5" />,
    text: "text-amber-700 dark:text-amber-300",
    progress: "bg-[linear-gradient(90deg,#b45309,#f59e0b,#fbbf24)]",
  },
  pwp: {
    icon: <Recycle className="h-5 w-5" />,
    text: "text-orange-700 dark:text-amber-300",
    progress: "bg-[linear-gradient(90deg,#ea580c,#f97316,#fbbf24)]",
  },
};

function groupSummary(insights: FinancialYearInsights, group: ClientGroup): GroupSummary {
  return group === "pibo" ? insights.pibo : insights.pwp;
}

function metricTone(metric: MetricKey) {
  if (metric === "used") return "text-amber-700 dark:text-amber-300";
  if (metric === "remaining") return "text-emerald-600 dark:text-emerald-300";
  if (metric === "excess") return "text-rose-600 dark:text-rose-300";
  return "text-default";
}

function supportLabels(group: ClientGroup) {
  const labels = GROUP_LABELS[group];
  return [
    { key: "base" as const, label: labels.baseLabel },
    { key: "used" as const, label: labels.usedLabel },
    { key: "remaining" as const, label: labels.remainingLabel },
    { key: "excess" as const, label: labels.excessLabel },
  ];
}

function metricPillEdges(rect: MetricPillRect): MetricPillEdges {
  return {
    bottom: rect.top + rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    top: rect.top,
  };
}

function metricPillRectFromEdges(edges: MetricPillEdges): MetricPillRect {
  return {
    height: Math.max(edges.bottom - edges.top, 4),
    left: edges.left,
    top: edges.top,
    width: Math.max(edges.right - edges.left, 4),
  };
}

function metricPillCenter(rect: MetricPillRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function metricRectsAreEqual(a: MetricPillRect | null, b: MetricPillRect) {
  if (!a) return false;
  return (
    Math.abs(a.left - b.left) < METRIC_RECT_EPSILON &&
    Math.abs(a.top - b.top) < METRIC_RECT_EPSILON &&
    Math.abs(a.width - b.width) < METRIC_RECT_EPSILON &&
    Math.abs(a.height - b.height) < METRIC_RECT_EPSILON
  );
}

function directionalSpring(delta: number, leadsWhenPositive: boolean) {
  if (Math.abs(delta) < METRIC_RECT_EPSILON) return METRIC_AXIS_SPRING;
  return delta > 0 === leadsWhenPositive ? METRIC_LEAD_SPRING : METRIC_TRAIL_SPRING;
}

function useDrawerRows({
  activeMetric,
  category,
  query,
  rows,
  sortKey,
}: {
  activeMetric: MetricKey;
  category: string;
  query: string;
  rows: InsightClientRow[];
  sortKey: SortKey;
}) {
  return useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesCategory = category === "all" || row.category === category;
      const matchesQuery =
        !normalisedQuery ||
        row.clientName.toLowerCase().includes(normalisedQuery) ||
        row.clientId.toLowerCase().includes(normalisedQuery);
      return matchesCategory && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (sortKey === "name") return a.clientName.localeCompare(b.clientName);
      return b.stats[sortKey] - a.stats[sortKey] || b.stats[activeMetric] - a.stats[activeMetric] || a.clientName.localeCompare(b.clientName);
    });
  }, [activeMetric, category, query, rows, sortKey]);
}

function HeroCard({
  active,
  group,
  onClick,
  summary,
}: {
  active: boolean;
  group: ClientGroup;
  onClick: () => void;
  summary: GroupSummary;
}) {
  const labels = GROUP_LABELS[group];
  const accent = GROUP_ACCENT[group];
  const progress = getProgress(summary.stats.used, summary.stats.base);
  const cardSurface =
    group === "pwp"
      ? "bg-[linear-gradient(112deg,rgba(124,45,18,0.16)_0%,rgba(var(--color-card-rgb),0.92)_50%,rgba(67,20,7,0.12)_100%)] dark:bg-[linear-gradient(112deg,#3b210f_0%,#201207_54%,#0c0906_100%)]"
      : "bg-[linear-gradient(112deg,rgba(var(--color-card-rgb),0.98)_0%,rgba(var(--color-card-rgb),0.90)_54%,rgba(245,158,11,0.08)_100%)] dark:bg-[linear-gradient(112deg,#050505_0%,#080806_58%,#11100b_100%)]";
  const borderTone = active
    ? group === "pibo"
      ? "border-amber-500/80 ring-2 ring-sky-500/30 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.52),0_22px_68px_-48px_rgba(245,158,11,0.82)]"
      : "border-amber-500/60 ring-2 ring-amber-500/18 shadow-[0_22px_68px_-48px_rgba(245,158,11,0.72)]"
    : group === "pwp"
      ? "border-amber-950/10 hover:border-amber-500/45 dark:border-amber-200/[0.12] dark:hover:border-amber-400/38"
      : "border-[var(--color-border)] hover:border-amber-400/50 dark:border-white/[0.14]";
  const iconTile =
    group === "pwp"
      ? "border-amber-300/12 bg-amber-500/12 text-orange-700 dark:border-amber-200/[0.08] dark:bg-amber-400/12 dark:text-amber-300"
      : "border-amber-400/14 bg-black/[0.04] text-amber-700 dark:border-amber-200/[0.08] dark:bg-white/[0.08] dark:text-amber-300";
  const clientTile =
    group === "pwp"
      ? "border-amber-900/10 bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.50)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.11]"
      : "border-base bg-surface shadow-sm dark:border-white/[0.12] dark:bg-white/[0.09]";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3 text-left transition-colors sm:rounded-[24px] sm:p-5",
        cardSurface,
        borderTone
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full blur-3xl",
          group === "pibo" ? "bg-amber-400/20 dark:bg-amber-500/16" : "bg-orange-400/24 dark:bg-orange-500/20"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-24 left-8 h-52 w-64 rounded-full blur-3xl",
          group === "pibo" ? "bg-orange-500/14 dark:bg-orange-500/18" : "bg-amber-500/18 dark:bg-amber-500/20"
        )}
      />
      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm sm:h-11 sm:w-11 sm:rounded-[16px]", iconTile, accent.text)}>
              {accent.icon}
            </div>
            <h3 className="mt-3 text-base font-semibold text-default sm:mt-5 sm:text-2xl">{labels.title}</h3>
            <p className="mt-2 hidden max-w-md text-sm leading-6 text-muted sm:block">{GROUP_DESCRIPTIONS[group]}</p>
          </div>
          <div className={cn("rounded-xl border px-2.5 py-1.5 text-right sm:rounded-2xl sm:px-3 sm:py-2", clientTile)}>
            <p className="text-[10px] font-semibold uppercase text-faint">Clients</p>
            <p className="mt-0.5 text-lg font-semibold text-default sm:mt-1 sm:text-xl">{formatInsightNumber(summary.clientCount)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
          <div>
            <p className="truncate text-[9px] font-semibold uppercase text-faint sm:text-[10px]">{labels.baseLabel}</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-default sm:text-lg">{formatInsightNumber(summary.stats.base)}</p>
          </div>
          <div>
            <p className="truncate text-[9px] font-semibold uppercase text-faint sm:text-[10px]">{labels.usedLabel}</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-amber-700 dark:text-amber-300 sm:text-lg">{formatInsightNumber(summary.stats.used)}</p>
          </div>
          <div>
            <p className="truncate text-[9px] font-semibold uppercase text-faint sm:text-[10px]">{labels.remainingLabel}</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-300 sm:text-lg">{formatInsightNumber(summary.stats.remaining)}</p>
          </div>
        </div>

        <div className="mt-3 sm:mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-faint">Progress</span>
            <span className="font-semibold text-default">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 rounded-full bg-black/10 dark:bg-white/10">
            <div className={cn("h-2 rounded-full", accent.progress)} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function MetricSelectionPill({
  reduced,
  targetRect,
}: {
  reduced: boolean;
  targetRect: MetricPillRect | null;
}) {
  const initialEdges = targetRect ? metricPillEdges(targetRect) : { bottom: 0, left: 0, right: 0, top: 0 };
  const leftEdge = useMotionValue(initialEdges.left);
  const rightEdge = useMotionValue(initialEdges.right);
  const topEdge = useMotionValue(initialEdges.top);
  const bottomEdge = useMotionValue(initialEdges.bottom);
  const previousRectRef = useRef<MetricPillRect | null>(targetRect);
  const controlsRef = useRef<Array<{ stop: () => void }>>([]);
  const mountedRef = useRef(false);

  const width = useTransform([rightEdge, leftEdge] as const, ([right, left]: number[]) => Math.max(right - left, 4));
  const height = useTransform([bottomEdge, topEdge] as const, ([bottom, top]: number[]) => Math.max(bottom - top, 4));
  const leftVelocity = useVelocity(leftEdge);
  const rightVelocity = useVelocity(rightEdge);
  const topVelocity = useVelocity(topEdge);
  const bottomVelocity = useVelocity(bottomEdge);

  const rawScaleX = useTransform(
    [leftVelocity, rightVelocity, topVelocity, bottomVelocity] as const,
    ([leftV, rightV, topV, bottomV]: number[]) => {
      if (reduced) return 1;
      const horizontal = Math.max(Math.abs(leftV), Math.abs(rightV));
      const vertical = Math.max(Math.abs(topV), Math.abs(bottomV));
      const horizontalAmount = Math.min(horizontal / 1200, 1);
      const verticalAmount = Math.min(vertical / 900, 1);
      const diagonal = horizontalAmount > 0.08 && verticalAmount > 0.08;
      const squash = diagonal ? 0.026 : 0.044;
      const counterStretch = diagonal ? horizontalAmount * 0.006 : 0;
      return Math.max(0.955, Math.min(1.03, 1 - verticalAmount * squash + counterStretch));
    }
  );
  const rawScaleY = useTransform(
    [leftVelocity, rightVelocity, topVelocity, bottomVelocity] as const,
    ([leftV, rightV, topV, bottomV]: number[]) => {
      if (reduced) return 1;
      const horizontal = Math.max(Math.abs(leftV), Math.abs(rightV));
      const vertical = Math.max(Math.abs(topV), Math.abs(bottomV));
      const horizontalAmount = Math.min(horizontal / 1200, 1);
      const verticalAmount = Math.min(vertical / 900, 1);
      const diagonal = horizontalAmount > 0.08 && verticalAmount > 0.08;
      const squash = diagonal ? 0.026 : 0.044;
      const counterStretch = diagonal ? verticalAmount * 0.006 : 0;
      return Math.max(0.955, Math.min(1.03, 1 - horizontalAmount * squash + counterStretch));
    }
  );
  const scaleX = useSpring(rawScaleX, reduced ? METRIC_REDUCED_SPRING : METRIC_SQUASH_SPRING);
  const scaleY = useSpring(rawScaleY, reduced ? METRIC_REDUCED_SPRING : METRIC_SQUASH_SPRING);

  useEffect(() => {
    if (!targetRect) return;
    const previousRect = previousRectRef.current;

    if (!reduced && previousRect && metricRectsAreEqual(previousRect, targetRect)) return;

    controlsRef.current.forEach((control) => control.stop());
    controlsRef.current = [];

    const nextEdges = metricPillEdges(targetRect);
    const setDirectly = () => {
      leftEdge.set(nextEdges.left);
      rightEdge.set(nextEdges.right);
      topEdge.set(nextEdges.top);
      bottomEdge.set(nextEdges.bottom);
    };

    if (!mountedRef.current || reduced || !previousRect) {
      setDirectly();
      mountedRef.current = true;
      previousRectRef.current = targetRect;
      return;
    }

    const visualRect = metricPillRectFromEdges({
      bottom: bottomEdge.get(),
      left: leftEdge.get(),
      right: rightEdge.get(),
      top: topEdge.get(),
    });
    const previousCenter = metricPillCenter(visualRect);
    const nextCenter = metricPillCenter(targetRect);
    const deltaX = nextCenter.x - previousCenter.x;
    const deltaY = nextCenter.y - previousCenter.y;

    controlsRef.current = [
      animate(leftEdge, nextEdges.left, { type: "spring", ...directionalSpring(deltaX, false) }),
      animate(rightEdge, nextEdges.right, { type: "spring", ...directionalSpring(deltaX, true) }),
      animate(topEdge, nextEdges.top, { type: "spring", ...directionalSpring(deltaY, false) }),
      animate(bottomEdge, nextEdges.bottom, { type: "spring", ...directionalSpring(deltaY, true) }),
    ];
    previousRectRef.current = targetRect;

    return () => {
      controlsRef.current.forEach((control) => control.stop());
      controlsRef.current = [];
    };
  }, [bottomEdge, leftEdge, reduced, rightEdge, targetRect, topEdge]);

  if (!targetRect) return null;

  return (
    <motion.span
      aria-hidden
      className="absolute rounded-full bg-gradient-to-r from-[#1c0d05] via-[#9a3412] to-[#d9480f] shadow-[0_10px_24px_-16px_rgba(154,52,18,0.82)] dark:from-amber-500 dark:via-orange-500 dark:to-amber-300"
      style={{
        height,
        left: leftEdge,
        pointerEvents: "none",
        scaleX,
        scaleY,
        top: topEdge,
        transformOrigin: "center center",
        width,
        willChange: "left, top, width, height, transform",
        zIndex: 0,
      }}
    />
  );
}

function MetricSegments({
  activeGroup,
  activeMetric,
  onMetricChange,
}: {
  activeGroup: ClientGroup;
  activeMetric: MetricKey;
  onMetricChange: (metric: MetricKey) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [pillRect, setPillRect] = useState<MetricPillRect | null>(null);

  const measurePill = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const button = track.querySelector<HTMLElement>(`[data-metric="${activeGroup}-${activeMetric}"]`);
    if (!button) return;
    const trackRect = track.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const nextRect = {
      height: buttonRect.height,
      left: buttonRect.left - trackRect.left,
      top: buttonRect.top - trackRect.top,
      width: buttonRect.width,
    };
    setPillRect((previousRect) => metricRectsAreEqual(previousRect, nextRect) ? previousRect : nextRect);
  }, [activeGroup, activeMetric]);

  useEffect(() => {
    const frame = requestAnimationFrame(measurePill);
    return () => cancelAnimationFrame(frame);
  }, [measurePill]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measurePill);
      return () => window.removeEventListener("resize", measurePill);
    }

    const observer = new ResizeObserver(measurePill);
    observer.observe(track);
    Array.from(track.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [measurePill]);

  return (
    <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-card p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(15,23,42,0.10)] dark:border-white/[0.12] dark:bg-white/[0.08] sm:rounded-full">
      <div ref={trackRef} className="relative grid grid-cols-2 gap-1 sm:grid-cols-4">
        <MetricSelectionPill reduced={reducedMotion ?? false} targetRect={pillRect} />
        {METRIC_ORDER.map((metric) => {
          const active = activeMetric === metric;
          return (
            <button
              key={metric}
              type="button"
              data-metric={`${activeGroup}-${metric}`}
              onClick={() => onMetricChange(metric)}
              className={cn(
                "relative z-[1] min-w-0 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs",
                active ? "text-white" : "text-muted hover:text-default"
              )}
            >
              <span className="relative z-[1] block truncate">{METRIC_LABELS[activeGroup][metric]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SupportMetric({
  activeMetric,
  group,
  stats,
}: {
  activeMetric: MetricKey;
  group: ClientGroup;
  stats: MetricSet;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
      {supportLabels(group).map((item) => {
        const active = activeMetric === item.key;
        return (
          <div key={item.key} className={cn("rounded-lg border border-soft px-2 py-1.5 sm:rounded-2xl sm:px-3 sm:py-2", active ? "bg-amber-500/12" : "bg-surface")}>
            <p className="truncate text-[9px] font-semibold uppercase text-faint sm:text-[10px]">{item.label}</p>
            <p className={cn("mt-1 truncate font-mono font-semibold", active ? "text-xs text-amber-700 dark:text-amber-300 sm:text-sm" : "text-xs text-muted")}>
              {formatInsightNumber(stats[item.key])}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TypeCategoryMatrix({
  activeGroup,
  activeMetric,
  stats,
}: {
  activeGroup: ClientGroup;
  activeMetric: MetricKey;
  stats: InsightStats;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {CREDIT_TYPES.map((type) => {
        const typeStats = stats.byType[type];
        return (
          <div key={type} className="rounded-2xl border border-base bg-card p-2.5 shadow-sm sm:rounded-[22px] sm:p-3.5 dark:border-white/[0.12] dark:bg-white/[0.07]">
            <div className="mb-2.5 flex items-start justify-between gap-2 sm:mb-3 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl",
                  type === "RECYCLING" ? "bg-amber-500/14 text-amber-700 dark:text-amber-300" : "bg-orange-500/14 text-orange-700 dark:text-orange-300"
                )}>
                  {type === "RECYCLING" ? <Recycle className="h-4 w-4" /> : <Leaf className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-default">{type === "RECYCLING" ? "Recycling" : "End of Life"}</p>
                  <p className="truncate text-[11px] text-faint sm:text-xs">{METRIC_LABELS[activeGroup][activeMetric]} by category</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("font-mono text-lg font-semibold sm:text-xl", metricTone(activeMetric))}>{formatInsightNumber(typeStats[activeMetric])}</p>
                <p className="text-[9px] uppercase text-faint sm:text-[10px]">{METRIC_LABELS[activeGroup][activeMetric]}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CAT_IDS.map((catId) => {
                const catStats = stats.byTypeCategory[type][catId];
                return (
                  <div key={catId} className="rounded-xl border border-soft bg-surface p-2 sm:rounded-[16px] sm:p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted">{CAT_DISPLAY[catId]}</span>
                      <span className={cn("font-mono text-base font-semibold", metricTone(activeMetric))}>
                        {formatInsightNumber(catStats[activeMetric])}
                      </span>
                    </div>
                    <SupportMetric activeMetric={activeMetric} group={activeGroup} stats={catStats} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClientRow({
  activeGroup,
  activeMetric,
  compact = false,
  onEditRecord,
  row,
}: {
  activeGroup: ClientGroup;
  activeMetric: MetricKey;
  compact?: boolean;
  onEditRecord: (record: FYRecord) => void;
  row: InsightClientRow;
}) {
  const labels = supportLabels(activeGroup);

  if (compact) {
    return (
      <div className="rounded-xl border border-base bg-card px-3 py-3 shadow-sm transition-colors dark:border-white/[0.12] dark:bg-white/[0.07] sm:rounded-2xl">
        <div className="grid grid-cols-[minmax(0,1fr)_82px_32px] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_132px_36px] sm:items-center sm:gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-default">{row.clientName}</p>
              {row.category && <span className="shrink-0"><CategoryBadge category={row.category} /></span>}
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-faint">{row.clientId}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-soft bg-surface px-2 py-1.5 text-right sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            <p className={cn("truncate font-mono text-sm font-semibold sm:text-base", metricTone(activeMetric))}>{formatInsightNumber(row.stats[activeMetric])}</p>
            <p className="truncate text-[8px] uppercase text-faint sm:text-[9px]">{METRIC_LABELS[activeGroup][activeMetric]}</p>
          </div>
          <button
            type="button"
            onClick={() => onEditRecord(row.record)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-base bg-surface text-muted transition-colors hover:text-default"
            aria-label={`Edit FY record for ${row.clientName}`}
            title="Edit FY record"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-faint sm:flex sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
          {labels.map((item) => (
            <span key={item.key} className={cn("rounded-md bg-surface px-2 py-1 font-mono sm:bg-transparent sm:px-0 sm:py-0", item.key === activeMetric ? metricTone(activeMetric) : "text-muted")}>
              <span className="font-sans">{item.label}: </span>{formatInsightNumber(row.stats[item.key])}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-w-0 overflow-hidden rounded-2xl border border-base bg-[rgba(var(--color-card-rgb),0.50)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.46),0_18px_44px_-32px_rgba(15,23,42,0.78)] backdrop-blur-[30px] dark:border-white/[0.12] dark:bg-white/[0.08]"
    )}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-default">{row.clientName}</p>
            {row.category && <span className="shrink-0"><CategoryBadge category={row.category} /></span>}
          </div>
          <p className="mt-1 font-mono text-xs text-faint">{row.clientId}</p>
        </div>
        <div className="min-w-[78px] shrink-0 text-right">
          <p className={cn("font-mono text-lg font-semibold", metricTone(activeMetric))}>{formatInsightNumber(row.stats[activeMetric])}</p>
          <p className="truncate text-[9px] uppercase text-faint">{METRIC_LABELS[activeGroup][activeMetric]}</p>
        </div>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {labels.map((item) => (
          <div key={item.key} className="min-w-0">
            <p className="truncate text-[9px] uppercase tracking-wide text-faint">{item.label}</p>
            <p className={cn("mt-1 truncate font-mono text-xs font-semibold", item.key === activeMetric ? metricTone(activeMetric) : "text-muted")}>
              {formatInsightNumber(row.stats[item.key])}
            </p>
          </div>
        ))}
      </div>

      {!compact && (
        <button
          type="button"
          onClick={() => onEditRecord(row.record)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-base bg-black px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-stone-800 dark:border-white/[0.10]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit FY Record
        </button>
      )}
    </div>
  );
}

function DetailPanel({
  activeGroup,
  activeMetric,
  group,
  onEditRecord,
  onOpenDrawer,
}: {
  activeGroup: ClientGroup;
  activeMetric: MetricKey;
  group: GroupSummary;
  onEditRecord: (record: FYRecord) => void;
  onOpenDrawer: () => void;
}) {
  const rows = getRowsForMetric(group.rows, activeMetric);
  const topRows = rows.slice(0, 5);
  const labels = GROUP_LABELS[activeGroup];

  return (
    <motion.section
      key={`${activeGroup}-${activeMetric}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl border border-base bg-card p-2.5 shadow-lg shadow-black/5 dark:border-amber-200/[0.12] dark:bg-[#12100d]/90 sm:rounded-[24px] sm:p-4"
    >
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between sm:mb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-300">Selected Detail</p>
          <h3 className="mt-1.5 text-base font-semibold text-default sm:mt-2 sm:text-2xl">
            {labels.title} - {METRIC_LABELS[activeGroup][activeMetric]}
          </h3>
          <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-muted sm:block">
            Focused view for {METRIC_LABELS[activeGroup][activeMetric].toLowerCase()} with Recycling, End of Life, and CAT-I to CAT-IV context.
          </p>
        </div>
        <div className="rounded-xl border border-base bg-surface px-3 py-2 text-left shadow-sm dark:border-white/[0.12] dark:bg-white/[0.08] sm:rounded-2xl sm:px-4 sm:py-3 md:text-right">
          <p className="text-[10px] font-semibold uppercase text-faint">{METRIC_LABELS[activeGroup][activeMetric]}</p>
          <p className={cn("mt-1 font-mono text-2xl font-semibold sm:text-3xl", metricTone(activeMetric))}>
            {formatInsightNumber(group.stats[activeMetric])}
          </p>
          <p className="mt-1 text-xs text-muted">{rows.length} related client{rows.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <TypeCategoryMatrix activeGroup={activeGroup} activeMetric={activeMetric} stats={group.stats} />

      <div className="mt-3 rounded-2xl border border-base bg-surface p-2.5 shadow-sm dark:border-white/[0.10] dark:bg-white/[0.055] sm:mt-4 sm:p-3.5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-default">Top related clients</h4>
            <p className="text-xs text-faint">Showing the top 5 by {METRIC_LABELS[activeGroup][activeMetric].toLowerCase()}.</p>
          </div>
          <button
            type="button"
            onClick={onOpenDrawer}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-950 px-3.5 py-2 text-xs font-semibold text-amber-50 shadow-[0_14px_30px_-20px_rgba(28,25,23,0.95)] transition-colors hover:bg-stone-800 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 sm:w-auto sm:rounded-full"
          >
            View all related clients
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {topRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-base bg-card p-8 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-faint" />
            <p className="mt-3 text-sm font-semibold text-default">No clients for this selected metric.</p>
            <p className="mt-1 text-xs text-muted">Try another segment or switch the hero card.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {topRows.map((row) => (
              <ClientRow
                key={row.record._id}
                activeGroup={activeGroup}
                activeMetric={activeMetric}
                compact
                onEditRecord={onEditRecord}
                row={row}
              />
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}

function ClientDrawer({
  activeGroup,
  activeMetric,
  onClose,
  onEditRecord,
  open,
  rows,
}: {
  activeGroup: ClientGroup;
  activeMetric: MetricKey;
  onClose: () => void;
  onEditRecord: (record: FYRecord) => void;
  open: boolean;
  rows: InsightClientRow[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>(activeMetric);
  const drawerRows = useDrawerRows({ activeMetric, category, query, rows, sortKey });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory("all");
    setSortKey(activeMetric);
  }, [activeGroup, activeMetric, open]);

  const categoryOptions = activeGroup === "pibo" ? PIBO_CATEGORIES : ["PWP"];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-30 flex justify-end overflow-hidden bg-black/18"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="relative flex h-full w-full max-w-[440px] min-w-0 flex-col overflow-hidden border-l border-base bg-[rgba(var(--color-card-rgb),0.76)] shadow-[-30px_0_80px_-58px_rgba(15,23,42,0.82)] backdrop-blur-[34px] dark:border-white/[0.12] dark:bg-[rgba(9,10,13,0.78)]"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
              <span className="absolute -left-24 top-8 h-56 w-56 rounded-full bg-amber-400/18 blur-3xl dark:bg-amber-500/14" />
              <span className="absolute -right-28 top-36 h-64 w-64 rounded-full bg-stone-500/14 blur-3xl dark:bg-white/[0.07]" />
              <span className="absolute bottom-[-5rem] left-10 h-60 w-80 rounded-full bg-orange-500/18 blur-3xl dark:bg-amber-600/18" />
            </div>
            <div className="relative z-[1] min-w-0 shrink-0 border-b border-soft px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-300">Related Clients</p>
                  <h3 className="mt-1 truncate text-lg font-semibold text-default">{METRIC_LABELS[activeGroup][activeMetric]}</h3>
                  <p className="mt-1 text-xs text-muted">{drawerRows.length} matching client{drawerRows.length === 1 ? "" : "s"}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-base bg-surface text-faint transition-colors hover:text-default"
                  aria-label="Close related clients drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 min-w-0 rounded-2xl border border-base bg-[rgba(var(--color-card-rgb),0.58)] px-3 backdrop-blur-[18px] dark:bg-black/22">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 shrink-0 text-faint" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search client or ID..."
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-default outline-none placeholder:text-faint"
                  />
                </div>
              </div>

              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="input-field min-w-0 !py-2 !text-xs"
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="input-field min-w-0 !py-2 !text-xs"
                >
                  {METRIC_ORDER.map((metric) => (
                    <option key={metric} value={metric}>Sort: {METRIC_LABELS[activeGroup][metric]}</option>
                  ))}
                  <option value="name">Sort: Client name</option>
                </select>
              </div>
            </div>

            <div className="relative z-[1] min-h-0 min-w-0 flex-1 overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-2 rounded-[22px] border border-base bg-[rgba(var(--color-card-rgb),0.26)] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_18px_54px_-38px_rgba(15,23,42,0.72)] backdrop-blur-[30px] dark:border-white/[0.08] dark:bg-black/18"
              />
              <div className="relative z-[1] h-full min-w-0 overflow-y-auto overflow-x-hidden p-3">
                {drawerRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-base bg-[rgba(var(--color-card-rgb),0.50)] p-8 text-center backdrop-blur-[24px] dark:bg-white/[0.07]">
                    <Users className="mx-auto h-7 w-7 text-faint" />
                    <p className="mt-3 text-sm font-semibold text-default">No matching clients</p>
                    <p className="mt-1 text-xs text-muted">Adjust search or category filters.</p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {drawerRows.map((row) => (
                      <ClientRow
                        key={row.record._id}
                        activeGroup={activeGroup}
                        activeMetric={activeMetric}
                        onEditRecord={onEditRecord}
                        row={row}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function FinancialYearInsightsModal({
  clients,
  financialYear,
  loading,
  onClose,
  onEditRecord,
  open,
  records,
}: {
  clients: Client[];
  financialYear: string;
  loading: boolean;
  onClose: () => void;
  onEditRecord: (record: FYRecord) => void;
  open: boolean;
  records: FYRecord[];
}) {
  const reducedMotion = useReducedMotion();
  const [activeGroup, setActiveGroup] = useState<ClientGroup>("pibo");
  const [activeMetric, setActiveMetric] = useState<MetricKey>("base");
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const insights = useMemo(() => buildFinancialYearInsights(records, clients), [records, clients]);
  const currentGroup = groupSummary(insights, activeGroup);
  const drawerRows = useMemo(() => getRowsForMetric(currentGroup.rows, activeMetric), [activeMetric, currentGroup.rows]);

  useEffect(() => {
    if (!open) return;
    setActiveGroup("pibo");
    setActiveMetric("base");
    setClientDrawerOpen(false);
  }, [open]);

  const handleEditRecord = (record: FYRecord) => {
    setClientDrawerOpen(false);
    onEditRecord(record);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Targets & Credits Dashboard"
      size="2xl"
      hideHeader
      bgColor="transparent"
      backdropFilter="none"
      backdropColor="rgba(0,0,0,0.52)"
      className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] rounded-[20px] sm:h-full sm:max-h-[90vh] sm:rounded-[30px]"
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-base bg-card text-default shadow-[0_32px_90px_-64px_rgba(28,25,23,0.78)] dark:border-amber-200/[0.12] dark:bg-[#090806] sm:rounded-[30px]"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <span className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-amber-400/16 blur-3xl dark:bg-amber-500/16" />
          <span className="absolute -right-32 top-36 h-80 w-80 rounded-full bg-teal-400/12 blur-3xl dark:bg-teal-400/12" />
          <span className="absolute bottom-[-7rem] left-1/4 h-72 w-[30rem] rounded-full bg-orange-500/16 blur-3xl dark:bg-orange-500/18" />
        </div>
        <div className="relative z-[1] grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-soft bg-[rgba(var(--color-card-rgb),0.88)] px-3.5 py-3 backdrop-blur-xl dark:border-amber-200/[0.10] dark:bg-stone-950/50 sm:px-5 sm:py-4 md:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/12 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              FY {financialYear}
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-tight text-default sm:mt-3 sm:text-2xl">Targets & Credits Dashboard</h2>
            <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-muted sm:block">
              A focused explanation of target demand, credit supply, achievement, sales, remaining quantity, and excess.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-base bg-surface text-faint transition-colors hover:text-default dark:border-white/[0.12] dark:bg-white/[0.10]"
            aria-label="Close targets and credits dashboard"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[rgba(var(--color-card-rgb),0.54)] p-2 backdrop-blur-xl dark:bg-black/20 sm:p-3.5 md:p-4">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-base bg-card text-sm font-semibold text-muted dark:border-white/[0.12] dark:bg-white/[0.07] sm:min-h-[360px]">
              Loading selected financial year dashboard...
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              <div className="grid gap-2 sm:gap-3.5 lg:grid-cols-2">
                <HeroCard
                  active={activeGroup === "pibo"}
                  group="pibo"
                  summary={insights.pibo}
                  onClick={() => setActiveGroup("pibo")}
                />
                <HeroCard
                  active={activeGroup === "pwp"}
                  group="pwp"
                  summary={insights.pwp}
                  onClick={() => setActiveGroup("pwp")}
                />
              </div>

              <MetricSegments activeGroup={activeGroup} activeMetric={activeMetric} onMetricChange={setActiveMetric} />

              <AnimatePresence mode="wait">
                <DetailPanel
                  key={`${activeGroup}-${activeMetric}`}
                  activeGroup={activeGroup}
                  activeMetric={activeMetric}
                  group={currentGroup}
                  onEditRecord={handleEditRecord}
                  onOpenDrawer={() => setClientDrawerOpen(true)}
                />
              </AnimatePresence>
            </div>
          )}
        </div>

        <ClientDrawer
          activeGroup={activeGroup}
          activeMetric={activeMetric}
          open={clientDrawerOpen}
          rows={drawerRows}
          onClose={() => setClientDrawerOpen(false)}
          onEditRecord={handleEditRecord}
        />
      </motion.div>
    </Modal>
  );
}
