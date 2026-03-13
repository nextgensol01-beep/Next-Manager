"use client";
import { useState, useContext } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency, FINANCIAL_YEARS, CURRENT_FY } from "@/lib/utils";
import { ThemeContext } from "@/app/providers";
import { Users, Leaf, TrendingUp, Target, DollarSign, AlertCircle, Award, BarChart2 } from "lucide-react";
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

export default function DashboardPage() {
  const { dark } = useContext(ThemeContext);
  const [fy, setFy] = useState(CURRENT_FY);

  const { data, loading } = useCache<DashboardData>(`/api/dashboard?fy=${fy}`);

  const chartGrid   = dark ? "#30363d" : "#e2e8f0";
  const chartAxis   = dark ? "#8b949e" : "#94a3b8";
  const tooltipBg   = dark ? "#161b22" : "#ffffff";
  const tooltipBorder = dark ? "#30363d" : "#e2e8f0";
  const tooltipText = dark ? "#e6edf3" : "#1e293b";

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of Nextgen Solutions EPR operations">
        <select className="input-field !w-auto" value={fy} onChange={(e) => setFy(e.target.value)}>
          {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>FY {y}</option>)}
        </select>
      </PageHeader>

      {loading ? <LoadingSpinner /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard index={0} title="Total Clients" value={data.totalClients} subtitle="All categories" icon={<Users className="w-5 h-5" />} color="blue" />
            <StatCard index={1} title="Credits Available" value={data.totalCreditsAvailable.toLocaleString()} subtitle="PWP this FY" icon={<Leaf className="w-5 h-5" />} color="green" />
            <StatCard index={2} title="Credits Sold" value={data.totalCreditsSold.toLocaleString()} subtitle="Transactions this FY" icon={<TrendingUp className="w-5 h-5" />} color="teal" />
            <StatCard index={3} title="Total Targets" value={data.totalTargets.toLocaleString()} subtitle="Producer/Importer/BO" icon={<Target className="w-5 h-5" />} color="purple" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard index={4} title="Achieved" value={data.totalAchieved.toLocaleString()} subtitle={`${data.totalTargets ? Math.round((data.totalAchieved / data.totalTargets) * 100) : 0}% of target`} icon={<Award className="w-5 h-5" />} color="orange" />
            <StatCard index={5} title="Total Revenue" value={formatCurrency(data.totalRevenue)} subtitle="This FY billing" icon={<DollarSign className="w-5 h-5" />} color="green" />
            <StatCard index={6} title="Total Collected" value={formatCurrency(data.totalPaid)} subtitle="Payments received" icon={<BarChart2 className="w-5 h-5" />} color="blue" />
            <StatCard title="Pending Payments" value={formatCurrency(data.totalPending)} subtitle="Outstanding amount" icon={<AlertCircle className="w-5 h-5" />} color="red" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
              <h3 className="font-semibold text-default mb-4">Year-wise Revenue & Collection</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.growthData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: chartAxis }} />
                  <YAxis tick={{ fontSize: 11, fill: chartAxis }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
                    labelStyle={{ color: tooltipText, fontWeight: 700, marginBottom: 4 }}
                    itemStyle={{ color: tooltipText }}
                    cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#2d47e2" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
              <h3 className="font-semibold text-default mb-4">FY {fy} Summary</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted">Target Achievement</span>
                    <span className="font-semibold">{data.totalTargets ? Math.round((data.totalAchieved / data.totalTargets) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2">
                    <div className="bg-brand-600 h-2 rounded-full transition-all" style={{ width: `${data.totalTargets ? Math.min(100, (data.totalAchieved / data.totalTargets) * 100) : 0}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-faint mt-1">
                    <span>Achieved: {data.totalAchieved.toLocaleString()}</span>
                    <span>Target: {data.totalTargets.toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted">Payment Collection</span>
                    <span className="font-semibold">{data.totalRevenue ? Math.round((data.totalPaid / data.totalRevenue) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${data.totalRevenue ? Math.min(100, (data.totalPaid / data.totalRevenue) * 100) : 0}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-faint mt-1">
                    <span>Collected: {formatCurrency(data.totalPaid)}</span>
                    <span>Total: {formatCurrency(data.totalRevenue)}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted">Credits Utilization</span>
                    <span className="font-semibold">{data.totalCreditsAvailable ? Math.round((data.totalCreditsSold / data.totalCreditsAvailable) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2">
                    <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${data.totalCreditsAvailable ? Math.min(100, (data.totalCreditsSold / data.totalCreditsAvailable) * 100) : 0}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-faint mt-1">
                    <span>Sold: {data.totalCreditsSold.toLocaleString()}</span>
                    <span>Available: {data.totalCreditsAvailable.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
