import type { QuotationStatus } from "@/lib/quotationRules";

export const QUOTATION_STATUS_CONFIG: Record<QuotationStatus, { label: string; dot: string; bg: string; text: string }> = {
  Draft: { label: "Draft", dot: "bg-slate-400", bg: "bg-slate-100 dark:bg-slate-800/60", text: "text-slate-600 dark:text-slate-300" },
  Finalized: { label: "Finalized", dot: "bg-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300" },
  Sent: { label: "Sent", dot: "bg-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  RevisionRequested: { label: "Revision Requested", dot: "bg-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300" },
  Accepted: { label: "Accepted", dot: "bg-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" },
  Rejected: { label: "Rejected", dot: "bg-red-400", bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-300" },
  Expired: { label: "Expired", dot: "bg-orange-300", bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-600 dark:text-orange-300" },
};

export function QuotationStatusPill({ status }: { status: QuotationStatus }) {
  const cfg = QUOTATION_STATUS_CONFIG[status] ?? QUOTATION_STATUS_CONFIG.Draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
