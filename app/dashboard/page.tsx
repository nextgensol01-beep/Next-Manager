"use client";
import { useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency, FINANCIAL_YEARS } from "@/lib/utils";
import { ThemeContext, useFinancialYearState } from "@/app/providers";
import {
  Users, Leaf, TrendingUp, Target, DollarSign,
  AlertCircle, Award, BarChart2,
} from "lucide-react";
import { useCache } from "@/lib/useCache";

interface DashboardData {
  totalClients: number;
  totalCreditsAvailable: number;
  totalCreditsSold: number;
  totalTargets: number;
  totalAchieved: number;
  totalRevenue: number;
  totalPaid: number;
  totalPending: number;
  growthData: { year: string; revenue: number; collected: number }[];
}

/* ── Compact Progress Bar ── */
function ProgressRow({
  label, pct, value, total, color,
}: {
  label: string; pct: number; value: string; total: string; color: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="text-sm font-semibold text-default">{pct}%</span>
      </div>
      <div
        className="w-full rounded-full"
        style={{ height: 5, background: "var(--color-border-soft)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-xs text-faint mt-1">
        <span>{value}</span>
        <span>{total}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { dark } = useContext(ThemeContext);
  const [fy, setFy] = useFinancialYearState();

  const { data, loading } = useCache<DashboardData>(`/api/dashboard?fy=${fy}`);

  /* ── Chart colours that adapt to light/dark ── */
  const chartGrid    = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const chartAxis    = dark ? "#8e8e93"                : "#6e6e73";
  const tooltipBg    = dark ? "#2c2c2e"                : "#ffffff";
  const tooltipBorder= dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const tooltipText  = dark ? "#f5f5f7"                : "#1d1d1f";

  /* ── Derived ── */
  const targetPct   = data?.totalTargets
    ? Math.round((data.totalAchieved  / data.totalTargets)  * 100) : 0;
  const paymentPct  = data?.totalRevenue
    ? Math.round((data.totalPaid      / data.totalRevenue)  * 100) : 0;
  const creditPct   = data?.totalCreditsAvailable
    ? Math.round((data.totalCreditsSold / data.totalCreditsAvailable) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of Nextgen Solutions EPR operations"
      >
        <select
          className="input-field !w-auto"
          value={fy}
          onChange={(e) => setFy(e.target.value)}
        >
          {FINANCIAL_YEARS.map((y) => (
            <option key={y} value={y}>FY {y}</option>
          ))}
        </select>
      </PageHeader>

      {loading ? (
        <LoadingSpinner />
      ) : data && (
        <>
          {/* ── Row 1: 4 stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard
              index={0} title="Total Clients"
              value={data.totalClients}
              subtitle="All categories"
              icon={<Users className="w-full h-full" />}
              color="blue"
            />
            <StatCard
              index={1} title="Credits Available"
              value={data.totalCreditsAvailable.toLocaleString()}
              subtitle="PWP this FY"
              icon={<Leaf className="w-full h-full" />}
              color="green"
            />
            <StatCard
              index={2} title="Credits Sold"
              value={data.totalCreditsSold.toLocaleString()}
              subtitle="Transactions this FY"
              icon={<TrendingUp className="w-full h-full" />}
              color="teal"
            />
            <StatCard
              index={3} title="Total Targets"
              value={data.totalTargets.toLocaleString()}
              subtitle="Producer / Importer / BO"
              icon={<Target className="w-full h-full" />}
              color="purple"
            />
          </div>

          {/* ── Row 2: 4 stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              index={4} title="Achieved"
              value={data.totalAchieved.toLocaleString()}
              subtitle={`${targetPct}% of target`}
              icon={<Award className="w-full h-full" />}
              color="orange"
            />
            <StatCard
              index={5} title="Total Revenue"
              value={formatCurrency(data.totalRevenue)}
              subtitle="This FY billing"
              icon={<DollarSign className="w-full h-full" />}
              color="green"
            />
            <StatCard
              index={6} title="Total Collected"
              value={formatCurrency(data.totalPaid)}
              subtitle="Payments received"
              icon={<BarChart2 className="w-full h-full" />}
              color="blue"
            />
            <StatCard
              index={7} title="Pending Payments"
              value={formatCurrency(data.totalPending)}
              subtitle="Outstanding amount"
              icon={<AlertCircle className="w-full h-full" />}
              color="red"
            />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

            {/* Bar chart */}
            <div
              className="rounded-2xl p-5 border"
              style={{
                background: "var(--color-card)",
                borderColor: "var(--color-border)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <h3
                className="font-semibold text-default mb-1"
                style={{ letterSpacing: "-0.01em" }}
              >
                Year-wise Revenue &amp; Collection
              </h3>
              <p className="text-xs text-faint mb-4">Billed vs. collected across financial years</p>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.growthData} barGap={3} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 11, fill: chartAxis }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: chartAxis }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                  />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{
                      background: tooltipBg,
                      border: `1px solid ${tooltipBorder}`,
                      borderRadius: 12,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: tooltipText, fontWeight: 600, marginBottom: 4 }}
                    itemStyle={{ color: tooltipText }}
                    cursor={{ fill: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8, color: chartAxis }}
                    iconType="circle" iconSize={7}
                  />
                  <Bar dataKey="revenue"   name="Revenue"   fill="#0071e3" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#30d158" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Progress metrics */}
            <div
              className="rounded-2xl p-5 border"
              style={{
                background: "var(--color-card)",
                borderColor: "var(--color-border)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <h3
                className="font-semibold text-default mb-1"
                style={{ letterSpacing: "-0.01em" }}
              >
                FY {fy} Summary
              </h3>
              <p className="text-xs text-faint mb-5">Key performance indicators</p>

              <div className="space-y-5">
                <ProgressRow
                  label="Target Achievement" pct={targetPct}
                  value={`Achieved: ${data.totalAchieved.toLocaleString()}`}
                  total={`Target: ${data.totalTargets.toLocaleString()}`}
                  color="#0071e3"
                />
                <ProgressRow
                  label="Payment Collection" pct={paymentPct}
                  value={`Collected: ${formatCurrency(data.totalPaid)}`}
                  total={`Total: ${formatCurrency(data.totalRevenue)}`}
                  color="#30d158"
                />
                <ProgressRow
                  label="Credit Utilisation" pct={creditPct}
                  value={`Sold: ${data.totalCreditsSold.toLocaleString()}`}
                  total={`Available: ${data.totalCreditsAvailable.toLocaleString()}`}
                  color="#32ade6"
                />
              </div>

              {/* Mini stat pills */}
              <div className="grid grid-cols-3 gap-3 mt-6">
                {[
                  { label: "Collection Rate", val: `${paymentPct}%`, color: "#30d158" },
                  { label: "Target Rate",     val: `${targetPct}%`,  color: "#0071e3" },
                  { label: "Credit Used",     val: `${creditPct}%`,  color: "#32ade6" },
                ].map(({ label, val, color }) => (
                  <div
                    key={label}
                    className="rounded-xl p-3 text-center"
                    style={{ background: "var(--color-surface)" }}
                  >
                    <div
                      className="text-lg font-bold"
                      style={{ color, letterSpacing: "-0.02em" }}
                    >
                      {val}
                    </div>
                    <div className="text-[10px] text-faint mt-0.5 leading-tight">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Area chart: revenue trend ── */}
          <div
            className="rounded-2xl p-5 border mb-5"
            style={{
              background: "var(--color-card)",
              borderColor: "var(--color-border)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <h3
              className="font-semibold text-default mb-1"
              style={{ letterSpacing: "-0.01em" }}
            >
              Revenue Trend
            </h3>
            <p className="text-xs text-faint mb-4">Rolling financial year performance</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.growthData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0071e3" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#0071e3" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#30d158" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#30d158" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: chartAxis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: chartAxis }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", fontSize: 12 }}
                  labelStyle={{ color: tooltipText, fontWeight: 600 }}
                  itemStyle={{ color: tooltipText }}
                />
                <Area type="monotone" dataKey="revenue"   name="Revenue"   stroke="#0071e3" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="#30d158" strokeWidth={2} fill="url(#colGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
