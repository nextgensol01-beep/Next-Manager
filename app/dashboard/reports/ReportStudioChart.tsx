"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Palette, Sparkles } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { REPORT_STUDIO_FIELD_MAP, type ReportStudioResponse } from "@/lib/report-studio";
import { formatCurrency } from "@/lib/utils";

type ReportStudioChartProps = {
  report: ReportStudioResponse;
  onRowClick: (row: ReportStudioResponse["rows"][number]) => void;
};

type ChartType = "bar" | "line" | "donut";

type ChartDatum = {
  name: string;
  axisLabel: string;
  value: number;
  index: number;
  color: string;
  groups: Array<{ label: string; value: string }>;
};

type PaletteDefinition = {
  id: string;
  label: string;
  premium?: boolean;
  light: string[];
  dark: string[];
};

const PALETTES: PaletteDefinition[] = [
  {
    id: "signature",
    label: "Signature",
    light: ["#0071e3", "#00a6a6", "#7657d6", "#e79100", "#e54878", "#18a957", "#1688c9", "#667085"],
    dark: ["#2997ff", "#2dd4bf", "#a78bfa", "#fbbf24", "#fb7185", "#4ade80", "#38bdf8", "#a8b2c1"],
  },
  {
    id: "aurora",
    label: "Aurora",
    premium: true,
    light: ["#635bff", "#00a88f", "#0b8ce9", "#b649d0", "#ec5b76", "#46a758", "#d9780d", "#536471"],
    dark: ["#8b85ff", "#2dd4bf", "#47b5ff", "#d879e8", "#ff7a90", "#6ee7a0", "#ffb454", "#aeb8c7"],
  },
  {
    id: "atelier",
    label: "Atelier",
    premium: true,
    light: ["#243c5a", "#c05746", "#4f7d6b", "#d49b45", "#77669d", "#3c7e98", "#9b5d73", "#73806f"],
    dark: ["#8eb8df", "#f08a78", "#79bea5", "#f0c36e", "#bba6e4", "#6fc2df", "#d99ab2", "#aebaa6"],
  },
  {
    id: "electric",
    label: "Electric",
    premium: true,
    light: ["#5746ea", "#008fbe", "#df3c96", "#009a73", "#e86818", "#315ecf", "#b06be0", "#66717f"],
    dark: ["#8175ff", "#23c7ee", "#ff70bd", "#2ee6aa", "#ff934f", "#6d91ff", "#d99cff", "#b4bfcc"],
  },
  {
    id: "monochrome",
    label: "Monochrome",
    light: ["#111827", "#334155", "#475569", "#64748b", "#7c8a9f", "#94a3b8", "#aab5c4", "#c0c8d2"],
    dark: ["#f8fafc", "#e2e8f0", "#cbd5e1", "#aebaca", "#94a3b8", "#78879a", "#607086", "#4b5b70"],
  },
];

const DEFAULT_PALETTE = PALETTES[0];
const GROUP_LABEL_SEPARATOR = "\u0001";

function quantity(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value || 0);
}

function truncate(value: string, maximum = 22) {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}

function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

function ExpandedSector(props: PieSectorDataItem) {
  return <Sector {...props} outerRadius={Number(props.outerRadius || 0) + 10} />;
}

function CategoryTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const [primary = "", secondary = ""] = String(payload?.value || "").split(GROUP_LABEL_SEPARATOR);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-10} y={secondary ? -3 : 3} textAnchor="end" fill="var(--color-text-muted)" fontSize={10.5} fontWeight={600}>
        {truncate(primary)}
      </text>
      {secondary && <text x={-10} y={11} textAnchor="end" fill="var(--color-text-faint)" fontSize={9}>{truncate(secondary)}</text>}
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  metricLabel,
  formatValue,
  total,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartDatum }>;
  metricLabel: string;
  formatValue: (value: number) => string;
  total: number;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="report-chart-tooltip min-w-[210px] rounded-2xl border border-base bg-card/95 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
      <div className="space-y-1.5">
        {datum.groups.map((group) => (
          <div key={group.label} className="flex items-center justify-between gap-5">
            <span className="report-chart-tooltip-label">{group.label}</span>
            <strong className="max-w-44 truncate text-default">{group.value}</strong>
          </div>
        ))}
      </div>
      <div className="my-2.5 h-px bg-[var(--color-border)]" />
      <div className="flex items-center justify-between gap-5">
        <span className="flex items-center gap-2 text-muted"><i className="h-2.5 w-2.5 rounded-full" style={{ background: datum.color }} />{metricLabel}</span>
        <strong className="tabular-nums text-default">{formatValue(datum.value)}</strong>
      </div>
      {total > 0 && <p className="report-chart-tooltip-note mt-1.5 text-right text-[10px] font-medium">{((datum.value / total) * 100).toFixed(1)}% of displayed total</p>}
      <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-brand-600 dark:text-[#64b5ff]">Click for details</p>
    </div>
  );
}

export default function ReportStudioChart({ report, onRowClick }: ReportStudioChartProps) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE.id);
  const [customColors, setCustomColors] = useState<string[]>(DEFAULT_PALETTE.light);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>();
  const paletteRef = useRef<HTMLDivElement>(null);
  const dark = useDarkMode();
  const reducedMotion = useReducedMotion();
  const groupFields = report.config.groupBy;
  const groupDefinitions = groupFields.map((field) => REPORT_STUDIO_FIELD_MAP.get(field)).filter(Boolean);
  const metricField = report.config.metrics[0];
  const metricDefinition = metricField ? REPORT_STUDIO_FIELD_MAP.get(metricField) : undefined;
  const selectedPalette = PALETTES.find((palette) => palette.id === paletteId);
  const colors = paletteId === "custom" ? customColors : (dark ? selectedPalette?.dark : selectedPalette?.light) || DEFAULT_PALETTE.light;

  useEffect(() => {
    const saved = window.localStorage.getItem("report-chart-palette");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { id?: string; colors?: string[] };
      if (parsed.id === "custom" && Array.isArray(parsed.colors) && parsed.colors.length >= 2) {
        setCustomColors(parsed.colors.slice(0, 8));
        setPaletteId("custom");
      } else if (PALETTES.some((palette) => palette.id === parsed.id)) {
        setPaletteId(parsed.id!);
      }
    } catch {
      // Ignore stale or malformed preferences and keep the safe default palette.
    }
  }, []);

  useEffect(() => {
    if (paletteId === "custom") window.localStorage.setItem("report-chart-palette", JSON.stringify({ id: paletteId, colors: customColors }));
    else window.localStorage.setItem("report-chart-palette", JSON.stringify({ id: paletteId }));
  }, [customColors, paletteId]);

  useEffect(() => {
    if (!paletteOpen) return;
    const close = (event: PointerEvent) => {
      if (!paletteRef.current?.contains(event.target as Node)) setPaletteOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [paletteOpen]);

  const secondaryValues = useMemo(() => {
    if (groupFields.length < 2) return [];
    return Array.from(new Set(report.rows.slice(0, 20).map((row) => String(row.values[groupFields[1]] ?? "No value"))));
  }, [groupFields, report.rows]);

  const data = useMemo<ChartDatum[]>(() => report.rows.slice(0, 20).map((row, index) => {
    const groups = groupFields.map((fieldId, groupIndex) => ({
      label: groupDefinitions[groupIndex]?.label || fieldId,
      value: String(row.values[fieldId] ?? "No value"),
    }));
    const colorIndex = groupFields.length > 1 ? Math.max(0, secondaryValues.indexOf(groups[1]?.value)) : index;
    return {
      name: groups.map((group) => group.value).join(" · "),
      axisLabel: groups.map((group) => group.value).join(GROUP_LABEL_SEPARATOR),
      value: Number(row.values[metricField]) || 0,
      index,
      color: colors[colorIndex % colors.length],
      groups,
    };
  }), [colors, groupDefinitions, groupFields, metricField, report.rows, secondaryValues]);

  if (!groupFields[0] || !metricField || !groupDefinitions[0] || !metricDefinition) return null;

  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const formatValue = (value: number) => metricDefinition.type === "currency" ? formatCurrency(value) : quantity(value);
  const groupTitle = groupDefinitions.map((definition) => definition?.label).filter(Boolean).join(" + ");
  const selectPalette = (palette: PaletteDefinition) => {
    setPaletteId(palette.id);
    setCustomColors(dark ? palette.dark : palette.light);
  };
  const editColor = (index: number, color: string) => {
    const base = paletteId === "custom" ? customColors : colors;
    setCustomColors(base.map((entry, entryIndex) => entryIndex === index ? color : entry));
    setPaletteId("custom");
  };
  const tooltip = <ChartTooltip metricLabel={metricDefinition.label} formatValue={formatValue} total={total} />;
  const animationProps = { isAnimationActive: !reducedMotion, animationDuration: reducedMotion ? 0 : 750, animationEasing: "ease-out" as const };

  return (
    <div className="relative overflow-hidden p-4 sm:p-5">
      <div className="report-chart-ambient" />
      <div className="relative mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-default">{metricDefinition.label} by {groupTitle}</p>
          <p className="mt-1 text-[11px] text-muted">Top {data.length} results · hover to explore · click to open underlying records</p>
          {secondaryValues.length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">{secondaryValues.map((value, index) => <span key={value} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted"><i className="h-2 w-2 rounded-full shadow-sm" style={{ background: colors[index % colors.length] }} />{value}</span>)}</div>}
        </div>
        <div className="flex items-center gap-2">
          <div ref={paletteRef} className="relative">
            <button type="button" onClick={() => setPaletteOpen((open) => !open)} aria-expanded={paletteOpen} className={`inline-flex h-9 items-center gap-2 rounded-xl border border-base bg-card px-3 text-[10px] font-semibold text-muted shadow-sm transition hover:-translate-y-0.5 hover:text-default hover:shadow-md ${paletteOpen ? "text-brand-600 ring-2 ring-brand-500/10" : ""}`}>
              <Palette className="h-3.5 w-3.5" />Colors<ChevronDown className={`h-3 w-3 transition-transform ${paletteOpen ? "rotate-180" : ""}`} />
            </button>
            {paletteOpen && <div className="absolute right-0 top-11 z-40 w-[min(330px,calc(100vw-2rem))] rounded-2xl border border-base bg-card/95 p-2.5 shadow-2xl backdrop-blur-xl">
              <div className="px-1.5 pb-2"><p className="text-xs font-semibold text-default">Chart color theme</p><p className="mt-0.5 text-[10px] text-muted">Mode-aware palettes, editable below.</p></div>
              <div className="space-y-1">{PALETTES.map((palette) => {
                const paletteColors = dark ? palette.dark : palette.light;
                const selected = paletteId === palette.id;
                return <button key={palette.id} type="button" onClick={() => selectPalette(palette)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${selected ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-muted hover:bg-surface hover:text-default"}`}>
                  <span className="flex -space-x-1">{paletteColors.slice(0, 5).map((color) => <i key={color} className="h-4 w-4 rounded-full border-2 border-card" style={{ background: color }} />)}</span>
                  <span className="min-w-0 flex-1 text-[11px] font-semibold">{palette.label}</span>
                  {palette.premium && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/35 dark:text-amber-300"><Sparkles className="h-2.5 w-2.5" />Premium</span>}
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>;
              })}</div>
              <div className="mt-2 border-t border-base px-1.5 pt-2.5"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-default">Edit current colors</span>{paletteId === "custom" && <span className="text-[9px] font-semibold text-brand-600">Custom</span>}</div><div className="mt-2 flex flex-wrap gap-2">{colors.map((color, index) => <label key={`${index}-${color}`} className="relative h-7 w-7 cursor-pointer rounded-full shadow-sm ring-1 ring-black/10 transition hover:scale-110 dark:ring-white/15" style={{ background: color }} title={`Edit color ${index + 1}`}><input type="color" value={color} onChange={(event) => editColor(index, event.target.value)} aria-label={`Edit chart color ${index + 1}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>)}</div></div>
            </div>}
          </div>
          <div className="flex rounded-xl border border-base bg-surface/70 p-1 shadow-inner">
            {(["bar", "line", "donut"] as const).map((type) => (
              <button key={type} type="button" onClick={() => setChartType(type)} className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold capitalize transition-all duration-200 ${chartType === type ? "bg-card text-brand-600 shadow-sm" : "text-muted hover:text-default"}`}>
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {chartType === "bar" && <ResponsiveContainer width="100%" height={Math.max(380, data.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ left: 18, right: 38, top: 8, bottom: 8 }}>
          <defs>{colors.map((color, index) => <linearGradient key={color} id={`report-bar-${index}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={color} stopOpacity={0.78} /><stop offset="100%" stopColor={color} /></linearGradient>)}</defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="4 6" horizontal={false} opacity={0.7} />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} />
          <YAxis type="category" dataKey="axisLabel" width={190} axisLine={false} tickLine={false} interval={0} tick={<CategoryTick />} />
          <Tooltip content={tooltip} cursor={{ fill: "var(--reports-blue-soft)", radius: 10 }} />
          <Bar {...animationProps} dataKey="value" name={metricDefinition.label} radius={[0, 9, 9, 0]} cursor="pointer" maxBarSize={25} activeBar={{ stroke: "var(--color-card)", strokeWidth: 2, fillOpacity: 0.86 }} onClick={(entry: ChartDatum) => report.rows[entry.index] && onRowClick(report.rows[entry.index])}>
            {data.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={`url(#report-bar-${Math.max(0, colors.indexOf(entry.color))})`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>}

      {chartType === "line" && <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ left: 8, right: 28, top: 14, bottom: 54 }} onClick={(state) => { const index = Number(state?.activeTooltipIndex); if (Number.isInteger(index) && report.rows[index]) onRowClick(report.rows[index]); }}>
          <defs><linearGradient id="report-line" x1="0" y1="0" x2="1" y2="0">{colors.slice(0, 4).map((color, index) => <stop key={color} offset={`${(index / Math.max(1, Math.min(colors.length, 4) - 1)) * 100}%`} stopColor={color} />)}</linearGradient></defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="4 6" vertical={false} opacity={0.7} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-28} textAnchor="end" interval={0} height={70} tick={{ fontSize: 9, fill: "var(--color-text-faint)" }} tickFormatter={(value) => truncate(String(value), 18)} />
          <YAxis axisLine={false} tickLine={false} width={60} tick={{ fontSize: 10, fill: "var(--color-text-faint)" }} />
          <Tooltip content={tooltip} cursor={{ stroke: "var(--color-text-faint)", strokeDasharray: "3 4", opacity: 0.5 }} />
          <Line {...animationProps} type="monotone" dataKey="value" name={metricDefinition.label} stroke="url(#report-line)" strokeWidth={3} cursor="pointer" dot={{ r: 4, fill: colors[0], stroke: "var(--color-card)", strokeWidth: 2 }} activeDot={{ r: 7, fill: colors[0], stroke: "var(--color-card)", strokeWidth: 3 }} />
        </LineChart>
      </ResponsiveContainer>}

      {chartType === "donut" && <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.42fr)]">
        <ResponsiveContainer width="100%" height={430}>
          <PieChart>
            <Tooltip content={tooltip} />
            <Pie {...animationProps} data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={88} outerRadius={146} paddingAngle={2.5} cornerRadius={5} cursor="pointer" activeIndex={activePieIndex} activeShape={ExpandedSector} onMouseEnter={(_entry, index) => setActivePieIndex(index)} onMouseLeave={() => setActivePieIndex(undefined)} onClick={(entry: ChartDatum) => report.rows[entry.index] && onRowClick(report.rows[entry.index])} labelLine={{ stroke: "var(--color-text-faint)", strokeWidth: 1 }} label={({ name, percent }) => Number(percent) >= 0.04 ? `${truncate(String(name), 14)} ${(Number(percent) * 100).toFixed(0)}%` : ""}>
              {data.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.color} stroke="var(--color-card)" strokeWidth={2} opacity={activePieIndex === undefined || activePieIndex === index ? 1 : 0.6} style={{ transition: reducedMotion ? "none" : "opacity 220ms ease, filter 220ms ease", filter: activePieIndex === index ? `drop-shadow(0 8px 12px ${entry.color}55)` : "none" }} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="rounded-2xl border border-base bg-surface/55 p-3.5">
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-base pb-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">Displayed total</p><strong className="mt-1 block text-lg tabular-nums text-default">{formatValue(total)}</strong></div><span className="text-[10px] text-muted">{data.length} segments</span></div>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">{data.map((entry, index) => <button key={`${entry.name}-legend-${index}`} type="button" onMouseEnter={() => setActivePieIndex(index)} onMouseLeave={() => setActivePieIndex(undefined)} onFocus={() => setActivePieIndex(index)} onBlur={() => setActivePieIndex(undefined)} onClick={() => report.rows[entry.index] && onRowClick(report.rows[entry.index])} className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition ${activePieIndex === index ? "bg-card shadow-sm" : "hover:bg-card/70"}`}><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.color }} /><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-muted">{entry.name}</span><strong className="text-[10px] tabular-nums text-default">{total > 0 ? `${((entry.value / total) * 100).toFixed(1)}%` : "0%"}</strong></button>)}</div>
        </div>
      </div>}
    </div>
  );
}
