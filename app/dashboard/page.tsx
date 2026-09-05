"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Leaf,
  Link2,
  ReceiptText,
  ShieldAlert,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { DashboardEmptyBlock, DashboardLoadingState, cn } from "@/components/dashboard/DashboardPrimitives";
import { useFinancialYearState } from "@/app/providers";
import { FINANCIAL_YEARS, formatCurrency } from "@/lib/utils";
import { useCache } from "@/lib/useCache";

type Severity = "critical" | "high" | "medium";
type Health = "Financial risk" | "Compliance risk" | "Needs attention" | "Healthy";

interface DashboardData {
  financialYear: string;
  asOf: string;
  context: {
    totalClients: number;
    activeClients: number;
    attentionCount: number;
    incompleteRelationships: number;
  };
  target: {
    total: number;
    achieved: number;
    remaining: number;
    excess: number;
    progressPct: number;
    incompleteClients: number;
  };
  credits: {
    generated: number;
    sold: number;
    remaining: number;
    oversold: number;
    utilizationPct: number;
    oversoldClients: number;
    supplyCoveragePct: number;
  };
  quotations: {
    total: number;
    openCount: number;
    openValue: number;
    acceptedCount: number;
    acceptedValue: number;
    conversionPct: number;
    draftCount: number;
    revisionRequestedCount: number;
    acceptedNotBilled: number;
  };
  finance: {
    billed: number;
    collected: number;
    outstanding: number;
    collectionPct: number;
    unappliedAdvance: number;
    invoiceGap: number;
    invoiceMissingCount: number;
    paidBillingCount: number;
    partialBillingCount: number;
    unpaidBillingCount: number;
  };
  work: {
    open: number;
    highPriority: number;
    annualReturnPending: number;
    invoiceMissing: number;
  };
  coverage: Array<{
    categoryId: string;
    category: string;
    type: "RECYCLING" | "EOL";
    target: number;
    achieved: number;
    remainingTarget: number;
    generated: number;
    sold: number;
    availableCredits: number;
    gap: number;
    coveragePct: number;
    status: "Critical" | "Shortage" | "Covered";
  }>;
  quoteToCash: Array<{
    key: string;
    label: string;
    count: number;
    value: number;
    href: string;
  }>;
  attentionItems: Array<{
    id: string;
    severity: Severity;
    clientId?: string;
    clientName: string;
    issue: string;
    impact: string;
    detailLabel: string;
    href: string;
  }>;
  clientHealth: Array<{
    clientId: string;
    clientName: string;
    category: string;
    operationalLabel: string;
    base: number;
    used: number;
    remaining: number;
    progressPct: number;
    openQuotationValue: number;
    billed: number;
    paid: number;
    outstanding: number;
    paymentStatus: "Paid" | "Partial" | "Unpaid";
    openTasks: number;
    annualReturnStatus: string;
    health: Health;
  }>;
}

type Accent = "blue" | "green" | "purple" | "orange" | "red";

const accentStyles: Record<Accent, { icon: string; text: string; bar: string; soft: string }> = {
  blue: { icon: "bg-blue-500 text-white", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500", soft: "bg-blue-50 dark:bg-blue-500/10" },
  green: { icon: "bg-emerald-500 text-white", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", soft: "bg-emerald-50 dark:bg-emerald-500/10" },
  purple: { icon: "bg-violet-500 text-white", text: "text-violet-600 dark:text-violet-400", bar: "bg-violet-500", soft: "bg-violet-50 dark:bg-violet-500/10" },
  orange: { icon: "bg-orange-500 text-white", text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500", soft: "bg-orange-50 dark:bg-orange-500/10" },
  red: { icon: "bg-rose-500 text-white", text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", soft: "bg-rose-50 dark:bg-rose-500/10" },
};

const severityStyles: Record<Severity, string> = {
  critical: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  medium: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
};

const healthStyles: Record<Health, string> = {
  "Financial risk": "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  "Compliance risk": "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  "Needs attention": "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  Healthy: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};

function formatNumber(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatShortCurrency(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (absolute >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (absolute >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value);
}

function AppleSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn(
      "rounded-[26px] border border-black/[0.07] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.18)]",
      className,
    )}>
      {children}
    </section>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 py-5 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-default">{title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function MetricCard({
  href,
  accent,
  title,
  icon,
  value,
  summary,
  progress,
  progressLabel,
  firstDetail,
  secondDetail,
}: {
  href: string;
  accent: Accent;
  title: string;
  icon: ReactNode;
  value: string;
  summary: string;
  progress: number;
  progressLabel: string;
  firstDetail: { label: string; value: string };
  secondDetail: { label: string; value: string };
}) {
  const styles = accentStyles[accent];
  return (
    <Link href={href} className="group block h-full rounded-[24px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
      <AppleSurface className="flex h-full min-h-[236px] flex-col p-5 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_24px_60px_rgba(15,23,42,0.09)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-muted">{title}</p>
            <p className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.045em] text-default">{value}</p>
            <p className="mt-2 min-h-10 text-[12px] leading-5 text-faint">{summary}</p>
          </div>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] shadow-sm", styles.icon)}>{icon}</div>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[11px]"><span className="text-faint">{progressLabel}</span><span className={cn("font-semibold", styles.text)}>{Math.round(progress)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10"><div className={cn("h-full rounded-full transition-all duration-700", styles.bar)} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          {[firstDetail, secondDetail].map((detail) => (
            <div key={detail.label} className={cn("rounded-[14px] px-3 py-2.5", styles.soft)}>
              <p className="truncate text-[10px] text-faint">{detail.label}</p>
              <p className="mt-1 truncate text-[12px] font-semibold text-default">{detail.value}</p>
            </div>
          ))}
        </div>
        <div className={cn("mt-3 inline-flex items-center gap-0.5 text-[11px] font-medium", styles.text)}>View details <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div>
      </AppleSurface>
    </Link>
  );
}

function ProgressBar({ value, accent = "blue" }: { value: number; accent?: Accent }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10"><div className={cn("h-full rounded-full", accentStyles[accent].bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export default function DashboardPage() {
  const [financialYear, setFinancialYear, financialYearLoaded] = useFinancialYearState();
  const { data, loading } = useCache<DashboardData>(`/api/dashboard?fy=${financialYear}`, { enabled: financialYearLoaded });

  return (
    <div className="pb-10">
      <PageHeader title="Dashboard" description="A clear view of work, value and completion across the business">
        <select className="input-field !w-auto" value={financialYear} onChange={(event) => setFinancialYear(event.target.value)} aria-label="Financial year">
          {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>FY {year}</option>)}
        </select>
      </PageHeader>

      {!financialYearLoaded || loading ? (
        <DashboardLoadingState />
      ) : !data ? (
        <DashboardEmptyBlock tone="rose" title="Dashboard unavailable" description="Refresh the page to load the operational summary." icon={<AlertTriangle className="h-5 w-5" />} />
      ) : (
        <div className="space-y-5">
          <AppleSurface className="overflow-hidden">
            <div className="relative px-5 py-6 sm:px-7 sm:py-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(0,122,255,0.10),transparent_32%),radial-gradient(circle_at_92%_100%,rgba(52,199,89,0.08),transparent_34%)] dark:bg-[radial-gradient(circle_at_8%_0%,rgba(10,132,255,0.14),transparent_34%),radial-gradient(circle_at_92%_100%,rgba(48,209,88,0.09),transparent_36%)]" />
              <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="max-w-xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/75 px-3 py-1.5 text-[11px] font-medium text-muted shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
                    FY {data.financialYear} overview
                  </div>
                  <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-[-0.045em] text-default sm:text-[34px]">Everything that needs a decision, in one place.</h1>
                  <p className="mt-3 text-[14px] leading-6 text-muted">Dates remain part of the record, but this view only flags unfinished work, balances and missing connections.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "All clients", value: data.context.totalClients, Icon: Users },
                    { label: "Active in FY", value: data.context.activeClients, Icon: Building2 },
                    { label: "Open signals", value: data.context.attentionCount, Icon: ShieldAlert },
                    { label: "Missing links", value: data.context.incompleteRelationships, Icon: Link2 },
                  ].map(({ label, value, Icon }) => (
                    <div key={label} className="min-w-32 rounded-[18px] border border-black/[0.06] bg-white/75 px-4 py-3.5 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.05]">
                      <div className="flex items-center gap-2 text-faint"><Icon className="h-3.5 w-3.5" /><span className="text-[10px] font-medium">{label}</span></div>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-default">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AppleSurface>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard href="/dashboard/financial-year" accent="blue" title="Target achievement" icon={<Target className="h-5 w-5" />} value={`${data.target.progressPct}%`} summary={`${formatNumber(data.target.achieved)} achieved from ${formatNumber(data.target.total)}`} progress={data.target.progressPct} progressLabel="Completed" firstDetail={{ label: "Remaining", value: formatNumber(data.target.remaining) }} secondDetail={{ label: "Incomplete clients", value: String(data.target.incompleteClients) }} />
            <MetricCard href="/dashboard/credit-transactions" accent="green" title="Credit inventory" icon={<Leaf className="h-5 w-5" />} value={formatNumber(data.credits.remaining)} summary={`${formatNumber(data.credits.sold)} sold from ${formatNumber(data.credits.generated)} generated`} progress={data.credits.utilizationPct} progressLabel="Inventory used" firstDetail={{ label: "Target coverage", value: `${data.credits.supplyCoveragePct}%` }} secondDetail={{ label: "Oversold", value: formatNumber(data.credits.oversold) }} />
            <MetricCard href="/dashboard/quotations" accent="purple" title="Quotation pipeline" icon={<FileText className="h-5 w-5" />} value={formatShortCurrency(data.quotations.openValue)} summary={`${data.quotations.openCount} open quotations · ${data.quotations.acceptedCount} accepted`} progress={data.quotations.conversionPct} progressLabel="Converted" firstDetail={{ label: "Drafts", value: String(data.quotations.draftCount) }} secondDetail={{ label: "Accepted, not billed", value: String(data.quotations.acceptedNotBilled) }} />
            <MetricCard href={`/dashboard/billing?fy=${encodeURIComponent(financialYear)}`} accent="red" title="Billing & collection" icon={<WalletCards className="h-5 w-5" />} value={formatShortCurrency(data.finance.outstanding)} summary={`${formatCurrency(data.finance.collected)} collected from ${formatCurrency(data.finance.billed)}`} progress={data.finance.collectionPct} progressLabel="Collected" firstDetail={{ label: "Partially paid", value: String(data.finance.partialBillingCount) }} secondDetail={{ label: "Unpaid", value: String(data.finance.unpaidBillingCount) }} />
            <MetricCard href="/dashboard/annual-return" accent="orange" title="Work & compliance" icon={<ClipboardCheck className="h-5 w-5" />} value={String(data.work.open)} summary={`${data.work.highPriority} high-priority items · ${data.work.annualReturnPending} returns incomplete`} progress={data.context.activeClients > 0 ? ((data.context.activeClients - data.work.annualReturnPending) / data.context.activeClients) * 100 : 0} progressLabel="Returns complete" firstDetail={{ label: "High priority", value: String(data.work.highPriority) }} secondDetail={{ label: "Invoice gaps", value: String(data.work.invoiceMissing) }} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.28fr_0.72fr]">
            <AppleSurface className="overflow-hidden">
              <SectionHeader title="Credit coverage" description="Remaining target compared with usable inventory—category by category." action={<Link href="/dashboard/financial-year" className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 dark:text-blue-400">View financial year <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
              <div className="grid gap-3 px-5 pt-5 sm:grid-cols-3 sm:px-6">
                {[
                  { label: "Target remaining", value: formatNumber(data.target.remaining), accent: "blue" as Accent },
                  { label: "Credits available", value: formatNumber(data.credits.remaining), accent: "green" as Accent },
                  { label: "Supply coverage", value: `${data.credits.supplyCoveragePct}%`, accent: data.credits.supplyCoveragePct >= 100 ? "green" as Accent : "red" as Accent },
                ].map((metric) => <div key={metric.label} className={cn("rounded-[18px] px-4 py-3.5", accentStyles[metric.accent].soft)}><p className="text-[11px] text-faint">{metric.label}</p><p className={cn("mt-1.5 text-xl font-semibold tracking-[-0.03em]", accentStyles[metric.accent].text)}>{metric.value}</p></div>)}
              </div>
              <div className="overflow-x-auto p-5 sm:p-6 sm:pt-4">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="text-[10px] font-medium text-faint"><tr><th className="pb-3">Category</th><th className="pb-3">Type</th><th className="pb-3 text-right">Target left</th><th className="pb-3 text-right">Credits left</th><th className="pb-3 pl-5">Coverage</th><th className="pb-3 text-right">Balance</th></tr></thead>
                  <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.07]">
                    {data.coverage.map((row) => {
                      const accent: Accent = row.status === "Covered" ? "green" : row.status === "Critical" ? "red" : "orange";
                      return <tr key={`${row.categoryId}-${row.type}`} className="transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.025]">
                        <td className="py-3.5 text-[13px] font-semibold text-default">{row.category}</td>
                        <td className="py-3.5"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", row.type === "EOL" ? accentStyles.purple.soft : accentStyles.blue.soft)}>{row.type === "EOL" ? "EOL" : "Recycling"}</span></td>
                        <td className="py-3.5 text-right text-[12px] text-muted">{formatNumber(row.remainingTarget)}</td>
                        <td className="py-3.5 text-right text-[12px] text-muted">{formatNumber(row.availableCredits)}</td>
                        <td className="py-3.5 pl-5"><div className="flex items-center gap-3"><div className="w-24"><ProgressBar value={row.coveragePct} accent={accent} /></div><span className="w-9 text-right text-[11px] font-medium text-muted">{row.coveragePct}%</span></div></td>
                        <td className={cn("py-3.5 text-right text-[12px] font-semibold", row.gap < 0 ? accentStyles.red.text : accentStyles.green.text)}>{row.gap > 0 ? "+" : ""}{formatNumber(row.gap)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </AppleSurface>

            <AppleSurface className="overflow-hidden">
              <SectionHeader title="Quotation to cash" description="The commercial journey, connected from first quote to collection." />
              <div className="space-y-2 p-5 sm:p-6">
                {data.quoteToCash.map((stage, index) => {
                  const accents: Accent[] = ["purple", "blue", "orange", "red", "green"];
                  const accent = accents[index] ?? "blue";
                  return <Link key={stage.key} href={stage.href} className="group flex items-center gap-3 rounded-[18px] border border-transparent px-3 py-3 transition hover:border-black/[0.06] hover:bg-black/[0.02] dark:hover:border-white/[0.07] dark:hover:bg-white/[0.03]">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold", accentStyles[accent].soft, accentStyles[accent].text)}>{index + 1}</div>
                    <div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-default">{stage.label}</p><p className="mt-0.5 text-[10px] text-faint">{stage.count} records</p></div>
                    <p className="text-[13px] font-semibold text-default">{formatShortCurrency(stage.value)}</p>
                    <ChevronRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
                  </Link>;
                })}
              </div>
            </AppleSurface>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <AppleSurface className="overflow-hidden">
              <SectionHeader title="Financial position" description="Balances and document status without date-based assumptions." action={<Link href={`/dashboard/billing?fy=${encodeURIComponent(financialYear)}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 dark:text-blue-400">Open billing <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
              <div className="grid gap-6 p-5 sm:grid-cols-[180px_1fr] sm:items-center sm:p-6">
                <div className="relative mx-auto h-40 w-40 rounded-full" style={{ background: `conic-gradient(#34c759 0 ${Math.min(100, data.finance.collectionPct)}%, rgba(120,120,128,0.12) ${Math.min(100, data.finance.collectionPct)}% 100%)` }}>
                  <div className="absolute inset-[13px] flex flex-col items-center justify-center rounded-full bg-white dark:bg-[#1c1c1e]"><span className="text-[28px] font-semibold tracking-[-0.04em] text-default">{data.finance.collectionPct}%</span><span className="mt-1 text-[11px] text-faint">collected</span></div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Total billed", value: data.finance.billed, Icon: ReceiptText, accent: "blue" as Accent },
                    { label: "Collected", value: data.finance.collected, Icon: CircleDollarSign, accent: "green" as Accent },
                    { label: "Outstanding", value: data.finance.outstanding, Icon: WalletCards, accent: "red" as Accent },
                    { label: "Unapplied advance", value: data.finance.unappliedAdvance, Icon: FileCheck2, accent: "orange" as Accent },
                    { label: "Without invoice", value: data.finance.invoiceGap, Icon: FileText, accent: "purple" as Accent },
                  ].map(({ label, value, Icon, accent }) => <div key={label} className="flex items-center gap-3 rounded-[14px] px-3 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"><div className={cn("flex h-8 w-8 items-center justify-center rounded-[10px]", accentStyles[accent].soft, accentStyles[accent].text)}><Icon className="h-4 w-4" /></div><span className="flex-1 text-[12px] text-muted">{label}</span><span className="text-[13px] font-semibold text-default">{formatShortCurrency(value)}</span></div>)}
                </div>
              </div>
              <div className="grid grid-cols-3 border-t border-black/[0.06] dark:border-white/[0.07]">
                {[{ label: "Paid", value: data.finance.paidBillingCount, accent: "green" as Accent }, { label: "Partial", value: data.finance.partialBillingCount, accent: "orange" as Accent }, { label: "Unpaid", value: data.finance.unpaidBillingCount, accent: "red" as Accent }].map((status) => <div key={status.label} className="border-r border-black/[0.06] px-4 py-4 text-center last:border-r-0 dark:border-white/[0.07]"><p className={cn("text-xl font-semibold", accentStyles[status.accent].text)}>{status.value}</p><p className="mt-1 text-[10px] text-faint">{status.label}</p></div>)}
              </div>
            </AppleSurface>

            <AppleSurface className="overflow-hidden">
              <SectionHeader title="Needs attention" description="Only unfinished states and missing connections—never age alone." action={<span className="rounded-full bg-orange-50 px-3 py-1.5 text-[11px] font-medium text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">{data.context.attentionCount} open</span>} />
              {data.attentionItems.length === 0 ? <div className="p-5 sm:p-6"><DashboardEmptyBlock tone="emerald" title="Everything is connected" description="No incomplete or mismatched records were found." icon={<Check className="h-5 w-5" />} /></div> : <div className="max-h-[430px] space-y-1 overflow-y-auto p-3 sm:p-4">
                {data.attentionItems.map((item) => <Link key={item.id} href={item.href} className="group flex items-center gap-3 rounded-[18px] px-3 py-3 transition hover:bg-black/[0.025] dark:hover:bg-white/[0.035]">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]", severityStyles[item.severity])}>{item.severity === "critical" ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-default">{item.clientName}</p><p className="mt-0.5 truncate text-[11px] text-muted">{item.issue}</p></div>
                  <div className="shrink-0 text-right"><p className="text-[12px] font-semibold text-default">{item.impact}</p><p className="mt-0.5 text-[10px] text-faint">{item.detailLabel}</p></div>
                  <ChevronRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>)}
              </div>}
            </AppleSurface>
          </section>

          <AppleSurface className="overflow-hidden">
            <SectionHeader title="Client overview" description="Operations, sales, billing and compliance in one readable row." action={<Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 dark:text-blue-400">All clients <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
            <div className="overflow-x-auto p-5 sm:p-6">
              <table className="w-full min-w-[1040px] text-left">
                <thead className="text-[10px] font-medium text-faint"><tr><th className="pb-3">Client</th><th className="pb-3">Operational progress</th><th className="pb-3 text-right">Open quote</th><th className="pb-3 text-right">Billed</th><th className="pb-3 text-right">Outstanding</th><th className="pb-3 text-center">Work</th><th className="pb-3">Annual return</th><th className="pb-3">Status</th><th className="w-8 pb-3" /></tr></thead>
                <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.07]">
                  {data.clientHealth.map((client) => <tr key={client.clientId} className="group transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.025]">
                    <td className="py-3.5"><Link href={`/dashboard/clients/${encodeURIComponent(client.clientId)}`}><p className="max-w-48 truncate text-[13px] font-semibold text-default">{client.clientName}</p><p className="mt-1 text-[10px] text-faint">{client.clientId} · {client.category}</p></Link></td>
                    <td className="py-3.5"><div className="w-44"><div className="mb-2 flex items-center justify-between text-[10px] text-faint"><span>{client.operationalLabel}</span><span>{client.progressPct}%</span></div><ProgressBar value={client.progressPct} accent={client.progressPct >= 100 ? "green" : "blue"} /><p className="mt-1.5 text-[10px] text-faint">{formatNumber(client.remaining)} remaining</p></div></td>
                    <td className="py-3.5 text-right text-[12px] text-muted">{formatShortCurrency(client.openQuotationValue)}</td>
                    <td className="py-3.5 text-right text-[12px] text-muted">{formatShortCurrency(client.billed)}</td>
                    <td className="py-3.5 text-right"><p className={cn("text-[12px] font-semibold", client.outstanding > 0 ? accentStyles.red.text : "text-muted")}>{formatShortCurrency(client.outstanding)}</p><p className="mt-1 text-[10px] text-faint">{client.paymentStatus}</p></td>
                    <td className="py-3.5 text-center"><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-black/[0.04] px-2 text-[11px] font-semibold text-muted dark:bg-white/[0.07]">{client.openTasks}</span></td>
                    <td className="py-3.5 text-[11px] text-muted">{client.annualReturnStatus}</td>
                    <td className="py-3.5"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", healthStyles[client.health])}>{client.health}</span></td>
                    <td className="py-3.5"><Link href={`/dashboard/clients/${encodeURIComponent(client.clientId)}`} aria-label={`Open ${client.clientName}`}><ChevronRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" /></Link></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/[0.06] px-5 py-4 text-[10px] text-faint dark:border-white/[0.07] sm:px-6">
              <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Payments stay linked to their original billing</span>
              <span className="inline-flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> Balances are based on completion, not due dates</span>
              <span className="inline-flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5" /> Quotations use their latest revision</span>
            </div>
          </AppleSurface>
        </div>
      )}
    </div>
  );
}
