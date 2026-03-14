"use client";
import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { FINANCIAL_YEARS, CURRENT_FY } from "@/lib/utils";
import { Download, Users, Leaf, ArrowLeftRight, CreditCard, FileText, Upload, ClipboardCheck } from "lucide-react";
import toast from "react-hot-toast";
import FYTabBar from "@/components/ui/FYTabBar";

const REPORT_TYPES = [
  { id: "targets", label: "Targets Report", description: "Category-wise targets (CAT-I–IV) with achievement per Producer/Importer/Brand Owner", icon: Users, color: "bg-blue-50 text-blue-600", darkColor: "dark:bg-blue-900/30 dark:text-blue-400" },
  { id: "pwp", label: "PWP Credits", description: "Category-wise available, used, and remaining credits for all PWP clients", icon: Leaf, color: "bg-emerald-50 text-emerald-600", darkColor: "dark:bg-emerald-900/30 dark:text-emerald-400" },
  { id: "transactions", label: "Credit Transactions", description: "Full transaction log with per-category quantities, rates, and credit type (Recycling/EOL)", icon: ArrowLeftRight, color: "bg-violet-50 text-violet-600", darkColor: "dark:bg-violet-900/30 dark:text-violet-400" },
  { id: "payments", label: "Outstanding Payments", description: "Billing vs payment status with pending amounts for all clients", icon: CreditCard, color: "bg-amber-50 text-amber-600", darkColor: "dark:bg-amber-900/30 dark:text-amber-400" },
  { id: "invoices", label: "Invoice Tracking", description: "Invoice period records — company, FY, from/to dates and duration", icon: FileText, color: "bg-rose-50 text-rose-600", darkColor: "dark:bg-rose-900/30 dark:text-rose-400" },
  { id: "annual-return", label: "EPR Annual Return", description: "Filing status for all clients — Pending, In Progress, Filed, Verified", icon: ClipboardCheck, color: "bg-indigo-50 text-indigo-600", darkColor: "dark:bg-indigo-900/30 dark:text-indigo-400" },
  { id: "uploads", label: "Upload Records", description: "Category-wise quantities uploaded to CPCB portal per company per FY", icon: Upload, color: "bg-teal-50 text-teal-600", darkColor: "dark:bg-teal-900/30 dark:text-teal-400" },
];

export default function ReportsPage() {
  const [fy, setFy] = useState(CURRENT_FY);
  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadReport = async (type: string) => {
    setDownloading(type);
    try {
      const r = await fetch(`/api/reports/export?type=${type}&fy=${fy}`);
      if (!r.ok) { toast.error("Failed to generate report"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-${fy}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded!");
    } catch { toast.error("Error generating report"); }
    finally { setDownloading(null); }
  };

  return (
    <div>
      <PageHeader title="Reports" description="Export all data as Excel files for analysis and records" />

      <FYTabBar value={fy} onChange={setFy} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {REPORT_TYPES.map(({ id, label, description, icon: Icon, color, darkColor }) => (
          <div key={id} className="bg-card border border-base rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color} ${darkColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-default mb-1">{label}</h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">{description}</p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-faint bg-surface px-2 py-0.5 rounded-full">FY {fy}</span>
              <span className="text-xs text-faint">·</span>
              <span className="text-xs text-faint">Excel .xlsx</span>
            </div>
            <button
              onClick={() => downloadReport(id)}
              disabled={downloading === id}
              className="btn-primary w-full justify-center"
            >
              <Download className="w-4 h-4" />
              {downloading === id ? "Generating..." : "Download"}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-card border border-base rounded-2xl p-5 transition-colors">
        <h4 className="font-semibold text-default mb-3 flex items-center gap-2">
          <span className="w-5 h-5 bg-brand-100 dark:bg-brand-900/40 text-brand-600 rounded flex items-center justify-center text-xs">💡</span>
          About Exports
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-muted">
          <div><strong className="text-default">Targets</strong> — CAT-I to IV targets, achieved vs remaining</div>
          <div><strong className="text-default">PWP Credits</strong> — Category-wise credits allocation and usage</div>
          <div><strong className="text-default">Transactions</strong> — All credit transfers with type (Recycling/EOL)</div>
          <div><strong className="text-default">Payments</strong> — Billing and payment status per client</div>
          <div><strong className="text-default">Invoices</strong> — Invoice period tracking per company</div>
          <div><strong className="text-default">Uploads</strong> — CPCB portal upload quantity records</div>
        </div>
      </div>
    </div>
  );
}
