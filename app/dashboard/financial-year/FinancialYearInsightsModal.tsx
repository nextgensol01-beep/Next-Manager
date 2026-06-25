"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from "framer-motion";
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

const METRIC_ORDER: MetricKey[] = ["base", "used", "remaining", "excess"];
const METRIC_LEAD_SPRING = { stiffness: 580, damping: 28, mass: 0.6 };
const METRIC_TRAIL_SPRING = { stiffness: 260, damping: 26, mass: 1.5 };
const METRIC_AXIS_SPRING = { stiffness: 580, damping: 30, mass: 0.6 };
const METRIC_SQUASH_SPRING = { stiffness: 420, damping: 22, mass: 0.5 };
const METRIC_REDUCED_SPRING = { stiffness: 300, damping: 40, mass: 1 };

const GROUP_DESCRIPTIONS: Record<ClientGroup, string> = {
  pibo: "Producer, Importer, and Brand Owner target demand for the selected financial year.",
  pwp: "PWP credit supply, sold movement, availability, and oversold pressure.",
};

const GROUP_ACCENT: Record<ClientGroup, {
  glow: string;
  icon: React.ReactNode;
  text: string;
  progress: string;
}> = {
  pibo: {
    glow: "from-amber-400/22 via-orange-300/10 to-transparent",
    icon: <Target className="h-5 w-5" />,
    text: "text-amber-700 dark:text-amber-300",
    progress: "bg-[linear-gradient(90deg,#b45309,#f59e0b,#fbbf24)]",
  },
  pwp: {
    glow: "from-orange-400/20 via-yellow-300/9 to-transparent",
    icon: <Recycle className="h-5 w-5" />,
    text: "text-orange-700 dark:text-orange-300",
    progress: "bg-[linear-gradient(90deg,#9a3412,#ea580c,#f59e0b)]",
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

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "relative overflow-hidden rounded-[28px] border p-5 text-left transition-colors md:p-5",
        "bg-white/78 shadow-[0_28px_72px_-56px_rgba(28,25,23,0.55)] backdrop-blur-[30px] dark:bg-[#12100d]/72",
        active ? "border-amber-500/70 ring-2 ring-amber-500/18" : "border-white/80 hover:border-amber-400/50 dark:border-white/[0.14]"
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br", accent.glow)} />
      <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/38 blur-3xl dark:bg-white/5" />

      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={cn("inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-white/72 shadow-sm dark:bg-white/[0.08]", accent.text)}>
              {accent.icon}
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-default">{labels.title}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">{GROUP_DESCRIPTIONS[group]}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/72 px-3 py-2 text-right backdrop-blur-2xl dark:border-white/[0.12] dark:bg-white/[0.09]">
            <p className="text-[10px] font-semibold uppercase text-faint">Clients</p>
            <p className="mt-1 text-xl font-semibold text-default">{formatInsightNumber(summary.clientCount)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase text-faint">{labels.baseLabel}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-default">{formatInsightNumber(summary.stats.base)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-faint">{labels.usedLabel}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-amber-700 dark:text-amber-300">{formatInsightNumber(summary.stats.used)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-faint">{labels.remainingLabel}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-300">{formatInsightNumber(summary.stats.remaining)}</p>
          </div>
        </div>

        <div className="mt-5">
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
  targetRect: { left: number; top: number; width: number; height: number } | null;
}) {
  const leadTarget = useMotionValue((targetRect?.left ?? 0) + (targetRect?.width ?? 0));
  const trailTarget = useMotionValue(targetRect?.left ?? 0);
  const topTarget = useMotionValue(targetRect?.top ?? 0);
  const heightTarget = useMotionValue(targetRect?.height ?? 0);

  const leadEdge = useSpring(leadTarget, reduced ? METRIC_REDUCED_SPRING : METRIC_LEAD_SPRING);
  const trailEdge = useSpring(trailTarget, reduced ? METRIC_REDUCED_SPRING : METRIC_TRAIL_SPRING);
  const top = useSpring(topTarget, reduced ? METRIC_REDUCED_SPRING : METRIC_AXIS_SPRING);
  const height = useSpring(heightTarget, reduced ? METRIC_REDUCED_SPRING : METRIC_AXIS_SPRING);
  const width = useTransform([leadEdge, trailEdge] as const, ([lead, trail]: number[]) => Math.max(lead - trail, 4));
  const trailVelocity = useVelocity(trailEdge);
  const rawSquashY = useTransform(
    trailVelocity,
    [-800, -200, 0, 200, 800],
    reduced ? [1, 1, 1, 1, 1] : [0.94, 0.98, 1, 0.98, 0.94]
  );
  const scaleY = useSpring(rawSquashY, reduced ? METRIC_REDUCED_SPRING : METRIC_SQUASH_SPRING);

  useEffect(() => {
    if (!targetRect) return;
    leadTarget.set(targetRect.left + targetRect.width);
    trailTarget.set(targetRect.left);
    topTarget.set(targetRect.top);
    heightTarget.set(targetRect.height);
  }, [heightTarget, leadTarget, targetRect, topTarget, trailTarget]);

  if (!targetRect) return null;

  return (
    <motion.span
      aria-hidden
      className="absolute rounded-full bg-gradient-to-r from-stone-950 via-amber-900 to-orange-700 shadow-[0_10px_24px_-14px_rgba(146,64,14,0.78)] dark:from-amber-500 dark:via-orange-500 dark:to-amber-300"
      style={{
        height,
        left: trailEdge,
        pointerEvents: "none",
        scaleY,
        top,
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
  const [pillRect, setPillRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const measurePill = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const button = track.querySelector<HTMLElement>(`[data-metric="${activeGroup}-${activeMetric}"]`);
    if (!button) return;
    const trackRect = track.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setPillRect({
      height: buttonRect.height,
      left: buttonRect.left - trackRect.left,
      top: buttonRect.top - trackRect.top,
      width: buttonRect.width,
    });
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
    <div className="rounded-full border border-white/80 bg-white/74 p-1 shadow-sm backdrop-blur-[28px] dark:border-white/[0.12] dark:bg-white/[0.08]">
      <div ref={trackRef} className="relative grid grid-cols-4 gap-1">
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
                "relative z-[1] rounded-full px-3 py-2 text-xs font-semibold transition-colors",
                active ? "text-white" : "text-muted hover:text-default"
              )}
            >
              <span className="relative z-[1]">{METRIC_LABELS[activeGroup][metric]}</span>
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
    <div className="grid grid-cols-2 gap-2">
      {supportLabels(group).map((item) => {
        const active = activeMetric === item.key;
        return (
          <div key={item.key} className={cn("rounded-2xl px-3 py-2", active ? "bg-amber-500/12" : "bg-surface/58")}>
            <p className="text-[10px] font-semibold uppercase text-faint">{item.label}</p>
            <p className={cn("mt-1 font-mono font-semibold", active ? "text-sm text-amber-700 dark:text-amber-300" : "text-xs text-muted")}>
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
    <div className="grid gap-4 lg:grid-cols-2">
      {CREDIT_TYPES.map((type) => {
        const typeStats = stats.byType[type];
        return (
          <div key={type} className="rounded-[24px] border border-white/72 bg-white/70 p-3.5 backdrop-blur-[28px] dark:border-white/[0.12] dark:bg-white/[0.07]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[18px]",
                  type === "RECYCLING" ? "bg-amber-500/14 text-amber-700 dark:text-amber-300" : "bg-orange-500/14 text-orange-700 dark:text-orange-300"
                )}>
                  {type === "RECYCLING" ? <Recycle className="h-4 w-4" /> : <Leaf className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-default">{type === "RECYCLING" ? "Recycling" : "End of Life"}</p>
                  <p className="text-xs text-faint">{METRIC_LABELS[activeGroup][activeMetric]} by category</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn("font-mono text-xl font-semibold", metricTone(activeMetric))}>{formatInsightNumber(typeStats[activeMetric])}</p>
                <p className="text-[10px] uppercase text-faint">{METRIC_LABELS[activeGroup][activeMetric]}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CAT_IDS.map((catId) => {
                const catStats = stats.byTypeCategory[type][catId];
                return (
                  <div key={catId} className="rounded-[18px] border border-soft bg-surface/74 p-2.5">
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
      <div className="rounded-[18px] border border-white/72 bg-white/72 px-3 py-2.5 backdrop-blur-[24px] dark:border-white/[0.12] dark:bg-white/[0.07]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold text-default">{row.clientName}</p>
              {row.category && <CategoryBadge category={row.category} />}
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-faint">{row.clientId}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn("font-mono text-base font-semibold", metricTone(activeMetric))}>{formatInsightNumber(row.stats[activeMetric])}</p>
            <p className="text-[9px] uppercase text-faint">{METRIC_LABELS[activeGroup][activeMetric]}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
          {labels.map((item) => (
            <span key={item.key} className={cn("font-mono", item.key === activeMetric ? metricTone(activeMetric) : "text-muted")}>
              <span className="font-sans">{item.label}: </span>{formatInsightNumber(row.stats[item.key])}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-[20px] border border-white/72 bg-white/72 p-3 backdrop-blur-[24px] dark:border-white/[0.12] dark:bg-white/[0.07]"
    )}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-default">{row.clientName}</p>
            {row.category && <CategoryBadge category={row.category} />}
          </div>
          <p className="mt-1 font-mono text-xs text-faint">{row.clientId}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className={cn("font-mono text-lg font-semibold", metricTone(activeMetric))}>{formatInsightNumber(row.stats[activeMetric])}</p>
          <p className="text-[10px] uppercase text-faint">{METRIC_LABELS[activeGroup][activeMetric]}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {labels.map((item) => (
          <div key={item.key} className="rounded-xl bg-surface/78 px-2.5 py-1.5">
            <p className="text-[10px] uppercase text-faint">{item.label}</p>
            <p className={cn("mt-1 font-mono text-xs font-semibold", item.key === activeMetric ? metricTone(activeMetric) : "text-muted")}>
              {formatInsightNumber(row.stats[item.key])}
            </p>
          </div>
        ))}
      </div>

      {!compact && (
        <button
          type="button"
          onClick={() => onEditRecord(row.record)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-base bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-default"
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
      className="rounded-[30px] border border-white/80 bg-white/76 p-4 shadow-[0_28px_80px_-62px_rgba(28,25,23,0.62)] backdrop-blur-[40px] dark:border-amber-200/[0.12] dark:bg-[#12100d]/76 md:p-4"
    >
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-300">Selected Detail</p>
          <h3 className="mt-2 text-2xl font-semibold text-default">
            {labels.title} - {METRIC_LABELS[activeGroup][activeMetric]}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Focused view for {METRIC_LABELS[activeGroup][activeMetric].toLowerCase()} with Recycling, End of Life, and CAT-I to CAT-IV context.
          </p>
        </div>
        <div className="rounded-[22px] border border-white/72 bg-white/74 px-4 py-3 text-left backdrop-blur-[28px] dark:border-white/[0.12] dark:bg-white/[0.08] md:text-right">
          <p className="text-[10px] font-semibold uppercase text-faint">{METRIC_LABELS[activeGroup][activeMetric]}</p>
          <p className={cn("mt-1 font-mono text-3xl font-semibold", metricTone(activeMetric))}>
            {formatInsightNumber(group.stats[activeMetric])}
          </p>
          <p className="mt-1 text-xs text-muted">{rows.length} related client{rows.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <TypeCategoryMatrix activeGroup={activeGroup} activeMetric={activeMetric} stats={group.stats} />

      <div className="mt-4 rounded-[24px] border border-white/68 bg-white/64 p-3.5 backdrop-blur-[28px] dark:border-white/[0.10] dark:bg-white/[0.055]">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-default">Top related clients</h4>
            <p className="text-xs text-faint">Showing the top 5 by {METRIC_LABELS[activeGroup][activeMetric].toLowerCase()}.</p>
          </div>
          <button
            type="button"
            onClick={onOpenDrawer}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-stone-950 px-3.5 py-2 text-xs font-semibold text-amber-50 shadow-[0_14px_30px_-20px_rgba(28,25,23,0.95)] transition-colors hover:bg-stone-800 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
          >
            View all related clients
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {topRows.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-base bg-surface/72 p-8 text-center">
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
  }, [activeMetric, open]);

  const categoryOptions = activeGroup === "pibo" ? PIBO_CATEGORIES : ["PWP"];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-30 flex justify-end bg-black/16"
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
            className="flex h-full w-full max-w-[440px] flex-col border-l border-white/78 bg-card/96 shadow-[-30px_0_80px_-58px_rgba(15,23,42,0.82)] backdrop-blur-[36px] dark:border-white/[0.12] dark:bg-[#090a0d]/96"
          >
            <div className="shrink-0 border-b border-soft px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-300">Related Clients</p>
                  <h3 className="mt-1 text-lg font-semibold text-default">{METRIC_LABELS[activeGroup][activeMetric]}</h3>
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

              <div className="mt-3 rounded-2xl border border-base bg-surface/86 px-3">
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

              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="input-field !py-2 !text-xs"
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="input-field !py-2 !text-xs"
                >
                  {METRIC_ORDER.map((metric) => (
                    <option key={metric} value={metric}>Sort: {METRIC_LABELS[activeGroup][metric]}</option>
                  ))}
                  <option value="name">Sort: Client name</option>
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {drawerRows.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-base bg-surface/58 p-8 text-center">
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
      className="rounded-[30px]"
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-stone-950/10 bg-stone-50/82 text-default shadow-[0_32px_90px_-64px_rgba(28,25,23,0.78)] backdrop-blur-[64px] dark:border-amber-200/[0.12] dark:bg-[#090806]/90"
      >
        <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-amber-400/22 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-orange-500/16 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-140px] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-stone-950/8 blur-3xl dark:bg-amber-200/[0.05]" />

        <div className="relative z-[1] flex shrink-0 flex-col gap-4 border-b border-stone-950/10 bg-stone-50/76 px-5 py-4 backdrop-blur-[56px] dark:border-amber-200/[0.10] dark:bg-stone-950/28 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/12 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              FY {financialYear}
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-default">Targets & Credits Dashboard</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              A focused explanation of target demand, credit supply, achievement, sales, remaining quantity, and excess.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full border border-white/78 bg-white/72 text-faint transition-colors hover:text-default dark:border-white/[0.12] dark:bg-white/[0.10] md:self-auto"
            aria-label="Close targets and credits dashboard"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto p-3.5 md:p-4">
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-white/72 bg-white/72 text-sm font-semibold text-muted backdrop-blur-[28px] dark:border-white/[0.12] dark:bg-white/[0.07]">
              Loading selected financial year dashboard...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3.5 lg:grid-cols-2">
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
