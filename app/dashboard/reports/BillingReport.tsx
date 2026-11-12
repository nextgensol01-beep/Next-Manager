"use client";
import { useEffect, useState } from "react";
import { Download, RefreshCw, Search, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils";
import type { BillingBillRow, BillingComponent, BillingReportOptions, BillingReportResponse } from "@/lib/billing-report";
import { BILLING_REPORT_CATEGORIES } from "@/lib/billing-report-categories";
import ReportSelect from "./ReportSelect";

const defaults = (financialYear: string): BillingReportOptions => ({ financialYear, view: "company", search: "", billType: "all", category: "all", paymentStatus: "all", invoiceState: "all", dateBasis: "invoiceDate", dateFrom: "", dateTo: "", includeUndated: false, page: 1, pageSize: 25 });
async function requestReport(options: BillingReportOptions, signal?: AbortSignal): Promise<BillingReportResponse> {
  const response = await fetch("/api/reports/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "billing-report", report: options }), signal });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Unable to load billing report");
  return body;
}

export default function BillingReport({ financialYear, ready }: { financialYear: string; ready: boolean }) {
  const [options, setOptions] = useState(() => defaults(financialYear));
  const [data, setData] = useState<BillingReportResponse | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<BillingBillRow | null>(null);
  const [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { setOptions(current => ({ ...current, financialYear, page: 1 })); setDetail(null); }, [financialYear]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    const timer = window.setTimeout(() => {
      requestReport(options, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [options, ready, revision]);
  const update = (next: Partial<BillingReportOptions>) => setOptions(current => ({ ...current, ...next, page: next.page ?? 1 }));
  const inspect = async (billingId: string) => {
    setReviewing(true);
    try {
      const result = await requestReport({ ...defaults(financialYear), view: "bill", search: billingId });
      setDetail(result.bills.find(b => b.billingId === billingId) || null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to open bill"); }
    finally { setReviewing(false); }
  };
  const classify = async (component: BillingComponent, category: string) => {
    if (saving) return;
    setSaving(`${component.billingId}:${component.key}`);
    try {
      const response = await fetch("/api/reports/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "billing-category", assignment: { billingId: component.billingId, componentKey: component.key, category } }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Unable to save category");
      toast.success("Report category saved");
      setDetail(null); setRevision(r => r + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save category"); }
    finally { setSaving(null); }
  };
  const download = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const response = await fetch("/api/reports/studio/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "billing-report", report: data.options }) });
      if (!response.ok) throw Error((await response.json()).error || "Export failed");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = `billing-${data.options.view}-${financialYear}.xlsx`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
    finally { setExporting(false); }
  };
  const select = (label: string, value: string, values: Array<{ value: string; label: string }>, onChange: (value: string) => void) => <label className="min-w-0 text-xs text-muted">{label}<ReportSelect className="mt-1" value={value} options={values} onChange={onChange} ariaLabel={label} /></label>;
  const categorySelect = (c: BillingComponent) => <select aria-label={`Category for ${c.description}`} className="input-field min-w-[180px] text-xs" value={c.category} disabled={Boolean(saving)} onChange={e => void classify(c, e.target.value)}>{BILLING_REPORT_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select>;
  const components = (values: BillingComponent[], showBill = true) => <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr>{[...(showBill ? ["Company / bill"] : []), "Component", "Category", "Taxable", "GST", "Gross billed"].map(label => <th key={label} className="table-header">{label}</th>)}</tr></thead><tbody>{values.map(c => <tr key={`${c.billingId}:${c.key}`}>
    {showBill && <td className="table-cell"><button className="text-left text-brand-600 hover:underline" onClick={() => void inspect(c.billingId)} disabled={reviewing}>{c.companyName}<small className="block text-faint">{c.invoiceNumber || c.billingId}</small></button></td>}
    <td className="table-cell">{c.description}{!c.taxKnown && <small className="block text-faint">Tax breakdown unavailable</small>}</td><td className="table-cell">{categorySelect(c)}</td><td className="table-cell tabular-nums">{c.taxable == null ? "—" : formatCurrency(c.taxable)}</td><td className="table-cell tabular-nums">{c.gst == null ? "—" : formatCurrency(c.gst)}</td><td className="table-cell font-semibold tabular-nums">{formatCurrency(c.gross)}</td>
  </tr>)}</tbody></table></div>;
  const billLink = (b: BillingBillRow) => <button className="text-left font-semibold text-brand-600 hover:underline" onClick={() => setDetail(b)}>{b.invoiceNumber || b.title}<small className="block text-[10px] font-normal text-faint">{b.billingId}</small></button>;
  const billRows = (bills: BillingBillRow[]) => <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr>{["Bill / invoice", "Company", "Invoice date", "Bill date", "Type", options.category === "all" ? "Gross billed" : "Selected charges", "Bill-level allocated paid", "Bill-level outstanding", "Payment"].map(label => <th key={label} className="table-header">{label}</th>)}</tr></thead><tbody>{bills.map(b => <tr key={b.billingId}><td className="table-cell">{billLink(b)}<small className="block text-faint">{b.invoiceCreated ? "Invoice created" : "Invoice not created"}</small></td><td className="table-cell">{b.companyName}</td><td className="table-cell">{b.invoiceDate || "Not recorded"}</td><td className="table-cell">{b.billDate || "Not recorded"}</td><td className="table-cell">{b.billType === "general" ? "General" : "Annual Return"}</td><td className="table-cell tabular-nums">{formatCurrency(options.category === "all" ? b.billed : b.selectedGross)}</td><td className="table-cell tabular-nums">{formatCurrency(b.paid)}</td><td className="table-cell tabular-nums">{formatCurrency(b.outstanding)}</td><td className="table-cell capitalize">{b.paymentStatus}</td></tr>)}</tbody></table></div>;
  return <section className="reports-glass-panel overflow-hidden rounded-[24px]" aria-label="Billing and payments report" aria-busy={loading}>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-default">Billing & Payments</h2><p className="mt-1 text-xs text-muted">Every eligible bill, with or without EPR records. Payments are allocated to bills.</p></div><div className="flex gap-2"><button className="report-secondary-button" aria-label="Refresh billing report" onClick={() => setRevision(r => r + 1)}><RefreshCw size={15} /></button><button className="report-secondary-button" disabled={!data || loading || exporting} onClick={() => void download()}><Download size={15} />{exporting ? "Exporting…" : "Export all matching"}</button></div></div>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-base bg-surface p-1">{([['company', 'Company-wise'], ['bill', 'Bill-wise'], ['component', 'Component-wise']] as const).map(([view, label]) => <button key={view} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${options.view === view ? "bg-card text-brand-600 shadow-sm" : "text-muted hover:bg-card"}`} aria-pressed={options.view === view} onClick={() => update({ view })}>{label}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs text-muted">Company, bill ID or invoice number<div className="mt-1 flex items-center gap-2 rounded-xl border border-base px-3"><Search size={15} /><input aria-label="Search billing report" className="h-10 min-w-0 flex-1 bg-transparent text-default outline-none" maxLength={160} value={options.search} onChange={e => update({ search: e.target.value })} /></div></label>
        {select("Bill type", options.billType, [{ value: "all", label: "All billing" }, { value: "annual_return", label: "Annual Return bills" }, { value: "general", label: "General bills" }], billType => update({ billType }))}
        {select("Billing category", options.category, [{ value: "all", label: "All categories" }, ...BILLING_REPORT_CATEGORIES.map(c => ({ value: c.id, label: c.label }))], category => update({ category }))}
        {select("Payment status", options.paymentStatus, ["all", "paid", "partial", "unpaid"].map(s => ({ value: s, label: s === "all" ? "All payment statuses" : s[0].toUpperCase() + s.slice(1) })), paymentStatus => update({ paymentStatus }))}
      </div>
      <details><summary className="cursor-pointer text-xs font-semibold text-muted">Dates and invoice state</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {select("Invoice state", options.invoiceState, [{ value: "all", label: "All bills" }, { value: "created", label: "Invoice created" }, { value: "not-created", label: "Invoice not created" }], invoiceState => update({ invoiceState }))}
        {select("Date basis", options.dateBasis, [{ value: "invoiceDate", label: "Invoice date" }, { value: "billDate", label: "Bill date" }], dateBasis => update({ dateBasis: dateBasis as BillingReportOptions["dateBasis"] }))}
        <label className="text-xs text-muted">From<input aria-label="Invoice range from" type="date" className="input-field mt-1" value={options.dateFrom} onChange={e => update({ dateFrom: e.target.value })} /></label><label className="text-xs text-muted">Through<input aria-label="Invoice range through" type="date" className="input-field mt-1" value={options.dateTo} onChange={e => update({ dateTo: e.target.value })} /></label>
      </div><label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={options.includeUndated} onChange={e => update({ includeUndated: e.target.checked })} />Include undated bills when a date range is selected</label></details>
      <p className="text-xs leading-5 text-muted">Amounts include GST. Payments show allocations to date, including applied advances; unapplied balances remain separate. Categories describe charges, independently of EPR targets.{options.category !== "all" && " Bill-level totals below cover whole bills containing the selected category; component gross covers only that category."}</p>
      {data && <><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
        ["Bills / companies", `${data.summary.billCount} / ${data.summary.companyCount}`], [options.category === "all" ? "Billed gross" : "Selected category gross", formatCurrency(options.category === "all" ? data.summary.billed : data.summary.componentGross)], [options.category === "all" ? "Allocated payments" : "Bill-level paid (context)", formatCurrency(data.summary.paid)], [options.category === "all" ? "Outstanding" : "Bill-level outstanding (context)", formatCurrency(data.summary.outstanding)], ["Unapplied advances", formatCurrency(data.summary.advance)], ["Selected component gross", formatCurrency(data.summary.componentGross)], ["Unclassified gross", formatCurrency(data.summary.unclassifiedGross)], ["Payments to review", formatCurrency(data.summary.unresolvedPayments)],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-base bg-card p-3"><p className="text-[11px] text-muted">{label}</p><p className="mt-1 font-semibold tabular-nums text-default">{value}</p></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{data.summary.discrepancyBills ? `${data.summary.discrepancyBills} bills have component differences` : "Bill and component totals reconcile"} · {data.summary.excludedBills} of {data.summary.baselineBills} FY bills excluded by filters</span><button className="text-brand-600 hover:underline" onClick={() => update({ view: "component", category: "unclassified" })}>Review unclassified charges ({data.summary.unclassifiedCount})</button></div>
        <details className="text-xs text-muted"><summary className="cursor-pointer">Reconciliation and exclusions</summary><p className="mt-2">FY baseline: {data.summary.baselineBills} bills · {formatCurrency(data.summary.baselineBilled)}. All components of matching bills: {formatCurrency(data.summary.allComponentGross)}. Overpayments: {formatCurrency(data.summary.overpayment)}.</p><p className="mt-1">Exclusions (in order): search {data.summary.exclusions.search}, type {data.summary.exclusions.billType}, invoice state {data.summary.exclusions.invoiceState}, date {data.summary.exclusions.date}, payment status {data.summary.exclusions.paymentStatus}, category {data.summary.exclusions.category}.</p><p className="mt-1">{data.summary.undated} FY bills have no selected date. {data.summary.legacyAllocationCount} payments use the existing unique Annual Return fallback. Advance balances cover matching companies across FYs. Payment review uses FY and search scope.</p></details>
        {data.issues.length > 0 && <details className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><summary className="cursor-pointer font-semibold"><AlertTriangle size={14} className="mr-1 inline" />{data.issues.length} payment allocations need review · {formatCurrency(data.summary.unresolvedPayments)}</summary><p className="mt-2">These payments have not been reassigned and do not reduce bill balances.</p><ul className="mt-2 space-y-2">{data.issues.map(i => <li key={i.paymentId} className="break-all">{i.clientId} · {formatCurrency(i.amount)} · {i.reason}<br />Payment {i.paymentId} · bill {i.billingId || "unlinked"}</li>)}</ul></details>}
      </>}
    </div>
    {loading || !ready ? <p role="status" className="p-8 text-center text-sm text-muted">Loading billing report…</p> : error ? <div role="alert" className="p-6 text-center text-sm text-muted">{error}<button className="report-text-button mx-auto mt-3" onClick={() => setRevision(r => r + 1)}>Try again</button></div> : data && <>
      {data.pagination.totalRows === 0 ? <p className="p-8 text-center text-sm text-muted">No bills match these filters. Review the exclusion counts above.</p> : options.view === "component" ? <>{components(data.components)}<p className="p-4 text-xs text-muted">Component payments and outstanding are not allocated. Open a bill to inspect its actual payment totals.</p></> : options.view === "bill" ? billRows(data.bills) : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr>{["Company / included bills", "Bills", options.category === "all" ? "Gross billed" : "Selected charges", "Bill-level allocated paid", "Bill-level outstanding", "Unapplied advance"].map(label => <th key={label} className="table-header">{label}</th>)}</tr></thead><tbody>{data.companies.map(c => <tr key={c.clientId}><td className="table-cell"><details><summary className="cursor-pointer font-semibold text-brand-600">{c.companyName}</summary><small className="my-2 block text-faint">{c.clientId}</small><div className="space-y-3">{c.bills.map(b => <div key={b.billingId}>{billLink(b)}<small className="block text-muted">{formatCurrency(b.billed)} billed · {formatCurrency(b.paid)} paid · {formatCurrency(b.outstanding)} outstanding</small></div>)}</div></details></td><td className="table-cell">{c.billCount}</td><td className="table-cell tabular-nums">{formatCurrency(options.category === "all" ? c.billed : c.selectedGross)}</td><td className="table-cell tabular-nums">{formatCurrency(c.paid)}</td><td className="table-cell tabular-nums">{formatCurrency(c.outstanding)}</td><td className="table-cell tabular-nums">{formatCurrency(c.advance)}</td></tr>)}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base p-4 text-xs text-muted"><span>{data.pagination.totalRows} matching rows · totals cover all pages</span><div className="flex items-center gap-2"><ReportSelect value={String(options.pageSize)} onChange={v => update({ pageSize: Number(v) })} ariaLabel="Billing rows per page" options={[10, 25, 50, 100].map(n => ({ value: String(n), label: `${n} rows` }))} /><button aria-label="Previous billing page" disabled={options.page <= 1} onClick={() => update({ page: options.page - 1 })}><ChevronLeft size={18} /></button><span>{data.pagination.page} / {data.pagination.totalPages}</span><button aria-label="Next billing page" disabled={options.page >= data.pagination.totalPages} onClick={() => update({ page: options.page + 1 })}><ChevronRight size={18} /></button></div></div>
    </>}
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Bill details" size="xl">{detail && <div className="space-y-4"><div><p className="font-semibold text-default">{detail.companyName} · {detail.invoiceNumber || detail.title}</p><p className="break-all text-xs text-faint">{detail.billingId} · FY {detail.financialYear}</p></div><p className="text-sm text-muted">Billed {formatCurrency(detail.billed)} · Allocated paid {formatCurrency(detail.paid)} · Outstanding {formatCurrency(detail.outstanding)}</p>{detail.warnings.map(w => <p key={w} className="text-xs text-amber-700 dark:text-amber-300">{w}</p>)}{components(detail.components, false)}<p className="text-xs text-muted">Category changes save report labels only. Historical bill lines, amounts and payment records remain unchanged.</p><a className="report-text-button" href={`/dashboard/billing?fy=${encodeURIComponent(detail.financialYear)}&clientId=${encodeURIComponent(detail.clientId)}`}>Open Billing & Payments</a></div>}</Modal>
  </section>;
}
