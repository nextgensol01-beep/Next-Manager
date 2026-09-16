"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function ReportQualityPanel({ open, financialYear, onClose }: { open: boolean; financialYear: string; onClose: () => void }) {
  const [records, setRecords] = useState<Array<{ id: string; number: string; client: string; status: string }> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    fetch(`/api/reports/studio/quality?fy=${encodeURIComponent(financialYear)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not load records"); setRecords(body.records); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [financialYear, attempt, open]);
  return <Modal open={open} title="Records needing attention" onClose={onClose} size="lg" fluidMotion>
    <p className="text-sm leading-6 text-muted">These quotations have no saved client link for FY {financialYear}. Their amounts cannot be included in client target reports. Open a quotation to review its client details.</p>
    {error ? <div role="alert" className="mt-4 rounded-xl border border-base p-4 text-sm text-muted">{error}<button onClick={() => setAttempt((value) => value + 1)} className="report-text-button ml-3">Try again</button></div> : !records ? <div role="status" className="p-10 text-center"><Loader2 className="mx-auto animate-spin" /><span className="sr-only">Loading records</span></div> : <div className="mt-5 divide-y divide-base rounded-xl border border-base">{records.length ? records.map((record) => <a key={record.id} className="flex items-center gap-3 p-4 hover:bg-surface" href={`/dashboard/quotations/${encodeURIComponent(record.id)}`}><div className="min-w-0 flex-1"><strong className="block text-sm text-default">{record.client || "Unnamed client"}</strong><span className="mt-1 block text-xs text-muted">{record.number} · {record.status}</span></div><ArrowUpRight size={16} className="text-brand-600" /></a>) : <p className="p-5 text-sm text-muted">No unlinked quotations remain. Refresh the report to update its data-quality notice.</p>}</div>}
    <a className="report-text-button mt-4" href={`/dashboard/quotations?financialYear=${encodeURIComponent(financialYear)}`}>Review all FY quotations<ArrowUpRight size={14} /></a>
  </Modal>;
}
