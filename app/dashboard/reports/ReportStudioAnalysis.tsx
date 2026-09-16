"use client";

import { useMemo } from "react";
import { BarChart3, CheckCircle2, CircleSlash2, PieChart as PieChartIcon, Users } from "lucide-react";
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
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ReportStudioAnalysisBucket,
  ReportStudioConfig,
  ReportStudioFieldDefinition,
  ReportStudioResponse,
} from "@/lib/report-studio";
import ReportSelect from "./ReportSelect";

type AnalysisPatch = Partial<ReportStudioConfig["analysis"]>;

type Props = {
  report: ReportStudioResponse;
  availableFields: ReportStudioFieldDefinition[];
  onChange: (patch: AnalysisPatch) => void;
  onDrilldown: (bucket: ReportStudioAnalysisBucket) => void;
};

const COLORS = ["#0071e3", "#16a085", "#7657d6", "#e79100", "#e54878", "#0891b2", "#64748b", "#22c55e", "#f97316", "#8b5cf6"];
const TONE_COLORS: Record<string, string> = {
  recorded: "#16a085",
  missing: "#e79100",
  excluded: "#94a3b8",
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)}%`;
}

function transformOptions(field: ReportStudioFieldDefinition) {
  const options = [
    { value: "presence", label: "Recorded vs missing" },
    { value: "value", label: "Count by value" },
  ];
  if (["number", "quantity", "currency", "percentage"].includes(field.type)) options.push({ value: "range", label: "Numeric ranges" });
  if (field.type === "date") options.push({ value: "timePeriod", label: "Time periods" });
  return options;
}

function AnalysisTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: { label?: string; value?: number } }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="rounded-xl border border-base bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"><span className="text-muted">{item.label}</span><strong className="ml-4 tabular-nums text-default">{formatCount(Number(item.value) || 0)} clients</strong></div>;
}

export default function ReportStudioAnalysis({ report, availableFields, onChange, onDrilldown }: Props) {
  const analysis = report.summary.analysis;
  const field = analysis.field;
  const options = transformOptions(field);
  const chartBuckets = analysis.chart === "line"
    ? analysis.buckets.filter((bucket) => bucket.tone === "value")
    : analysis.buckets.filter((bucket) => bucket.value > 0);
  const data = useMemo(() => chartBuckets.map((bucket, index) => ({
    ...bucket,
    color: TONE_COLORS[bucket.tone || ""] || COLORS[index % COLORS.length],
  })), [chartBuckets]);
  const denominatorLabel = analysis.excluded > 0 ? "Applicable clients" : "Matching clients";
  const missingPercent = analysis.applicable > 0 ? analysis.missing / analysis.applicable * 100 : 0;
  const hasChartData = data.some((bucket) => bucket.value > 0);
  const selectBucket = (entry: { id?: string; payload?: { id?: string } }) => {
    const bucketId = entry.payload?.id || entry.id;
    const bucket = analysis.buckets.find((candidate) => candidate.id === bucketId);
    if (bucket) onDrilldown(bucket);
  };

  return <div className="space-y-5 p-4 sm:p-5">
    <div className="rounded-2xl border border-base bg-surface/65 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Analyze field<span className="mt-1.5 block"><ReportSelect value={field.id} onChange={(value) => onChange({ field: value, transform: "presence" })} ariaLabel="Field to analyze" searchable options={availableFields.map((definition) => ({ value: definition.id, label: definition.label, group: definition.group }))} /></span></label>
        <label className="min-w-[210px] text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Break down by<span className="mt-1.5 block"><ReportSelect value={analysis.transform} onChange={(value) => onChange({ transform: value as ReportStudioConfig["analysis"]["transform"] })} ariaLabel="Analysis method" options={options} /></span></label>
        {analysis.transform === "range" && <label className="min-w-[145px] text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Ranges<span className="mt-1.5 block"><ReportSelect value={String(report.config.analysis.bucketCount)} onChange={(value) => onChange({ bucketCount: Number(value) })} ariaLabel="Number of ranges" options={[3, 4, 5, 6, 8, 10].map((count) => ({ value: String(count), label: `${count} ranges` }))} /></span></label>}
        {analysis.transform === "timePeriod" && <label className="min-w-[145px] text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Period<span className="mt-1.5 block"><ReportSelect value={report.config.analysis.timePeriod} onChange={(value) => onChange({ timePeriod: value as ReportStudioConfig["analysis"]["timePeriod"] })} ariaLabel="Time period" options={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} /></span></label>}
      </div>
      <p className="mt-3 text-[11px] text-muted">Counting distinct clients after the report’s current search and filters. Select a chart segment or breakdown row to open those clients.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Total clients", value: analysis.total, detail: "All matching clients", Icon: Users, color: "text-brand-600" },
        { label: denominatorLabel, value: analysis.applicable, detail: analysis.excluded > 0 ? `${formatCount(analysis.excluded)} not applicable` : "Analysis denominator", Icon: PieChartIcon, color: "text-violet-600" },
        { label: "Recorded", value: analysis.recorded, detail: `${formatPercent(analysis.coveragePercent)} coverage`, Icon: CheckCircle2, color: "text-emerald-600" },
        { label: "No record", value: analysis.missing, detail: `${formatPercent(missingPercent)} missing`, Icon: CircleSlash2, color: "text-amber-600" },
      ].map(({ label, value, detail, Icon, color }) => <div key={label} className="rounded-2xl border border-base bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</span><Icon className={`h-4 w-4 ${color}`} /></div><strong className="mt-2 block text-2xl tabular-nums text-default">{formatCount(value)}</strong><span className="mt-1 block text-[10px] text-muted">{detail}</span></div>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
      <section className="min-h-[410px] rounded-2xl border border-base bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-default">{field.label}</h3><p className="mt-1 text-[11px] text-muted">{options.find((option) => option.value === analysis.transform)?.label}</p></div><BarChart3 className="h-4 w-4 text-brand-600" /></div>
        {!hasChartData ? <div className="flex h-[330px] items-center justify-center text-sm text-muted">No values are available for this analysis.</div> : <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {analysis.chart === "donut" ? <PieChart><Tooltip content={<AnalysisTooltip />} /><Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={82} outerRadius={132} paddingAngle={3} cornerRadius={6} onClick={selectBucket}>{data.map((entry) => <Cell key={entry.id} fill={entry.color} cursor="pointer" />)}</Pie></PieChart>
              : analysis.chart === "line" ? <LineChart data={data} margin={{ left: 0, right: 18, top: 14, bottom: 42 }} onClick={(state) => { const index = Number(state?.activeTooltipIndex); if (Number.isInteger(index) && data[index]) selectBucket(data[index]); }}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} /><XAxis dataKey="label" angle={-25} textAnchor="end" height={70} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} /><Tooltip content={<AnalysisTooltip />} /><Line type="monotone" dataKey="value" stroke="#0071e3" strokeWidth={3} dot={{ r: 4, fill: "#0071e3" }} activeDot={{ r: 7, cursor: "pointer" }} /></LineChart>
                : <BarChart data={data} margin={{ left: 0, right: 14, top: 14, bottom: 52 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} /><XAxis dataKey="label" angle={-25} textAnchor="end" height={80} interval={0} tick={{ fill: "var(--color-text-muted)", fontSize: 9 }} /><YAxis allowDecimals={false} tick={{ fill: "var(--color-text-muted)", fontSize: 10 }} /><Tooltip content={<AnalysisTooltip />} /><Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={58} onClick={selectBucket}>{data.map((entry) => <Cell key={entry.id} fill={entry.color} cursor="pointer" />)}</Bar></BarChart>}
          </ResponsiveContainer>
        </div>}
      </section>

      <section className="rounded-2xl border border-base bg-card p-3 shadow-sm">
        <div className="px-1 pb-2"><h3 className="text-xs font-semibold text-default">Breakdown</h3><p className="mt-0.5 text-[10px] text-muted">Counts use all matching clients.</p></div>
        <div className="max-h-[390px] space-y-1 overflow-y-auto">{analysis.buckets.map((bucket, index) => {
          const percent = analysis.total > 0 ? bucket.value / analysis.total * 100 : 0;
          const color = TONE_COLORS[bucket.tone || ""] || COLORS[index % COLORS.length];
          return <button key={bucket.id} type="button" onClick={() => onDrilldown(bucket)} className="group block w-full rounded-xl px-2.5 py-2.5 text-left transition hover:bg-surface"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} /><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-default">{bucket.label}</span><strong className="text-[11px] tabular-nums text-default">{formatCount(bucket.value)}</strong></span><span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface"><i className="block h-full rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%`, background: color }} /></span><span className="mt-1 block text-right text-[9px] text-faint">{formatPercent(percent)} · view clients</span></button>;
        })}</div>
      </section>
    </div>
  </div>;
}
