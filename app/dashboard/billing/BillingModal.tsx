"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Building2, CalendarDays, Check, IndianRupee, Sparkles, Target, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { FINANCIAL_YEARS, formatCurrency } from "@/lib/utils";
import type { Billing, Client, CreditTransaction, FinancialYearRecord, TargetBillingRow } from "./types";
import {
  CATEGORY_LABELS,
  PIBO_CATEGORIES,
  breakdownToTargetRows,
  dateInputValue,
  rateForTarget,
  targetEntriesFromRecord,
  targetRowsToBreakdown,
} from "./helpers";

type BillingForm = {
  clientId: string;
  financialYear: string;
  govtCharges: string;
  consultancyCharges: string;
  targetCharges: string;
  otherCharges: string;
  notes: string;
  dueDate: string;
};

interface BillingModalProps {
  open: boolean;
  editingBilling: Billing | null;
  clients: Client[];
  fy: string;
  onClose: () => void;
  onSaved: () => void;
}

function emptyBillingForm(financialYear: string): BillingForm {
  return {
    clientId: "",
    financialYear,
    govtCharges: "0",
    consultancyCharges: "0",
    targetCharges: "0",
    otherCharges: "0",
    notes: "",
    dueDate: "",
  };
}

function formFromBilling(billing: Billing): BillingForm {
  return {
    clientId: billing.clientId,
    financialYear: billing.financialYear,
    govtCharges: String(billing.govtCharges ?? 0),
    consultancyCharges: String(billing.consultancyCharges ?? 0),
    targetCharges: String(billing.targetCharges ?? 0),
    otherCharges: String(billing.otherCharges ?? 0),
    notes: billing.notes || "",
    dueDate: dateInputValue(billing.dueDate),
  };
}

export default function BillingModal({ open, editingBilling, clients, fy, onClose, onSaved }: BillingModalProps) {
  const [form, setForm] = useState<BillingForm>(() => emptyBillingForm(fy));
  const [targetRows, setTargetRows] = useState<TargetBillingRow[]>([]);
  const [targetSuggestionsLoading, setTargetSuggestionsLoading] = useState(false);
  const [targetSuggestionsError, setTargetSuggestionsError] = useState("");
  const [useTransactionRates, setUseTransactionRates] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editingBilling ? formFromBilling(editingBilling) : emptyBillingForm(fy));
    setTargetRows(editingBilling ? breakdownToTargetRows(editingBilling.targetBreakdown) : []);
    setTargetSuggestionsError("");
    setTargetSuggestionsLoading(false);
    setUseTransactionRates(true);
  }, [editingBilling, fy, open]);

  const selectedBillingClient = clients.find((c) => c.clientId === form.clientId);
  const isPiboBillingClient = Boolean(selectedBillingClient && PIBO_CATEGORIES.has(selectedBillingClient.category));
  const formTotal = Number(form.govtCharges) + Number(form.consultancyCharges) + Number(form.targetCharges) + Number(form.otherCharges);

  const targetRowsTotal = useMemo(
    () => targetRows.reduce((sum, row) => {
      if (!row.include) return sum;
      const taxable = Number(row.quantity || 0) * Number(row.rate || 0);
      const gst = taxable * (Number(row.gstPercent || 0) / 100);
      return sum + taxable + gst;
    }, 0),
    [targetRows]
  );

  useEffect(() => {
    if (editingBilling) return;
    if (!open || !form.clientId || !form.financialYear || !isPiboBillingClient) {
      setTargetRows([]);
      setTargetSuggestionsError("");
      return;
    }

    let cancelled = false;
    (async () => {
      setTargetSuggestionsLoading(true);
      setTargetSuggestionsError("");
      try {
        const [fyRes, txRes] = await Promise.all([
          fetch(`/api/financial-year?clientId=${encodeURIComponent(form.clientId)}&fy=${encodeURIComponent(form.financialYear)}`, { cache: "no-store" }),
          fetch(`/api/credit-transactions?toClientId=${encodeURIComponent(form.clientId)}&fy=${encodeURIComponent(form.financialYear)}`, { cache: "no-store" }),
        ]);
        const fyBody = await fyRes.json().catch(() => null);
        const txBody = await txRes.json().catch(() => null);
        if (!fyRes.ok) throw new Error(fyBody?.error || "Failed to load target data");
        if (!txRes.ok) throw new Error(txBody?.error || "Failed to load transaction rates");
        if (cancelled) return;

        const record = Array.isArray(fyBody) ? fyBody[0] as FinancialYearRecord | undefined : null;
        const targets = targetEntriesFromRecord(record);
        const transactions = Array.isArray(txBody) ? txBody as CreditTransaction[] : [];
        setTargetRows(targets.map((target) => {
          const txRate = useTransactionRates ? rateForTarget(transactions, target) : 0;
          return {
            key: `${target.categoryId}-${target.type}`,
            categoryId: target.categoryId,
            type: target.type,
            quantity: String(target.value),
            rate: txRate > 0 ? String(txRate) : "",
            gstPercent: "18",
            include: true,
            rateSource: txRate > 0 ? "transaction" : "manual",
          };
        }));
      } catch (err) {
        if (cancelled) return;
        setTargetRows([]);
        setTargetSuggestionsError(err instanceof Error ? err.message : "Failed to load target suggestions");
      } finally {
        if (!cancelled) setTargetSuggestionsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [editingBilling, form.clientId, form.financialYear, isPiboBillingClient, open, useTransactionRates]);

  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const targetBreakdown = targetRowsToBreakdown(targetRows);
      const breakdownTotal = targetBreakdown.reduce((sum, row) => sum + row.totalAmount, 0);
      const shouldSave =
        (isPiboBillingClient || Boolean(editingBilling)) &&
        targetBreakdown.length > 0 &&
        Math.abs(Number(form.targetCharges || 0) - breakdownTotal) < 0.01;

      const response = await fetch(editingBilling ? `/api/billing/${editingBilling._id}` : "/api/billing", {
        method: editingBilling ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          govtCharges: Number(form.govtCharges),
          consultancyCharges: Number(form.consultancyCharges),
          targetCharges: Number(form.targetCharges),
          otherCharges: Number(form.otherCharges),
          targetBreakdown: shouldSave ? targetBreakdown : [],
          dueDate: form.dueDate || null,
        }),
      });
      if (!response.ok) {
        toast.error("Error saving billing");
        return;
      }
      toast.success(editingBilling ? "Billing updated!" : "Billing saved!");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingBilling ? "Edit Billing" : "Add Billing"}
      size="2xl"
      hideHeader
      className="max-h-[calc(100dvh-16px)] rounded-[28px] border-white/70 bg-white/95 shadow-[0_32px_100px_rgba(0,0,0,0.28)] sm:max-h-[92vh] sm:rounded-[38px] dark:border-white/[0.12] dark:bg-[#1c1c1e]/95"
      backdropFilter="blur(18px) saturate(150%)"
      backdropColor="rgba(10,10,12,0.48)"
    >
      <form onSubmit={saveBilling} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-black/[0.06] bg-white/70 px-5 py-5 backdrop-blur-2xl sm:px-8 sm:py-6 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/20 sm:h-12 sm:w-12">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{editingBilling ? "Billing workspace" : "New annual billing"}</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-default sm:text-2xl">{editingBilling ? "Edit billing" : "Add billing"}</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">Set charges, review automatic target suggestions, and confirm the annual total.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-muted transition hover:bg-black/[0.08] active:scale-95 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <section className="rounded-[24px] border border-black/[0.07] bg-[#f5f5f7]/75 p-4 sm:rounded-[30px] sm:p-5 dark:border-white/[0.09] dark:bg-white/[0.045]">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-white text-brand-600 shadow-sm dark:bg-white/[0.08]"><Building2 className="h-4 w-4" /></div>
                  <div><p className="text-sm font-semibold text-default">Account details</p><p className="text-xs text-muted">Choose the client and reporting year.</p></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Client *</label>
          <select className="input-field h-12 rounded-2xl bg-white shadow-sm dark:bg-white/[0.06]" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required disabled={Boolean(editingBilling)}>
            <option value="">Select Client</option>
            {clients.map((client) => <option key={client.clientId} value={client.clientId}>{client.companyName}</option>)}
          </select>
          {editingBilling && <p className="text-xs text-faint mt-1">Client cannot be changed while editing.</p>}
        </div>
        <div>
          <label className="label">Financial Year *</label>
          <select className="input-field h-12 rounded-2xl bg-white shadow-sm dark:bg-white/[0.06]" value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} required disabled={Boolean(editingBilling)}>
            {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          {editingBilling && <p className="text-xs text-faint mt-1">Financial year is locked to prevent duplicate records.</p>}
        </div>
                </div>
              </section>

        {form.clientId && (
          <section className="rounded-[24px] border border-brand-200/60 bg-gradient-to-br from-brand-50/80 to-white p-4 shadow-[0_18px_50px_rgba(37,99,235,0.06)] sm:rounded-[30px] sm:p-5 dark:border-brand-500/20 dark:from-brand-950/25 dark:to-white/[0.04]">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-default"><Sparkles className="h-4 w-4 text-brand-600" />PIBO Target Suggestions</p>
                <p className="text-xs text-faint mt-1">
                  {isPiboBillingClient
                    ? "Targets pulled from Financial Year records. Rates from received credit transactions."
                    : "Available only for Producer, Importer, and Brand Owner clients."}
                </p>
              </div>
              {isPiboBillingClient && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-muted">
                  <input type="checkbox" checked={useTransactionRates} onChange={(ev) => setUseTransactionRates(ev.target.checked)} className="h-4 w-4 rounded border-base" />
                  Use transaction rates
                </label>
              )}
            </div>
            {isPiboBillingClient && targetSuggestionsLoading ? (
              <p className="text-sm text-muted">Loading target suggestions...</p>
            ) : isPiboBillingClient && targetSuggestionsError ? (
              <p className="text-sm text-red-500">{targetSuggestionsError}</p>
            ) : isPiboBillingClient && targetRows.length === 0 ? (
              <p className="text-sm text-muted">No target rows found for this client and FY.</p>
            ) : isPiboBillingClient && (
              <div className="space-y-3">
                <div className="hidden grid-cols-[36px_minmax(88px,1.1fr)_minmax(76px,.85fr)_minmax(90px,1fr)_minmax(105px,1fr)_minmax(78px,.75fr)_minmax(90px,.9fr)] gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint md:grid">
                  <span>Use</span><span>Category</span><span>Type</span><span>Target Qty</span><span>Rate</span><span>GST %</span><span className="text-right">Total</span>
                </div>
                <div className="space-y-2.5">
                  {targetRows.map((row) => {
                    const taxable = Number(row.quantity || 0) * Number(row.rate || 0);
                    const gstAmt = taxable * (Number(row.gstPercent || 0) / 100);
                    const total = taxable + gstAmt;
                    const updateRow = (patch: Partial<TargetBillingRow>) => setTargetRows((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, ...patch } : candidate));
                    return (
                      <div key={row.key} className={`rounded-[20px] border p-3 transition md:grid md:grid-cols-[36px_minmax(88px,1.1fr)_minmax(76px,.85fr)_minmax(90px,1fr)_minmax(105px,1fr)_minmax(78px,.75fr)_minmax(90px,.9fr)] md:items-center md:gap-2 ${row.include ? "border-brand-200/70 bg-white/85 shadow-sm dark:border-brand-500/20 dark:bg-white/[0.055]" : "border-black/[0.06] bg-white/45 opacity-65 dark:border-white/[0.07] dark:bg-white/[0.025]"}`}>
                        <div className="flex items-center justify-between md:block">
                          <span className="text-xs font-medium text-muted md:hidden">Include</span>
                          <input type="checkbox" checked={row.include} onChange={(event) => updateRow({ include: event.target.checked })} className="h-4 w-4 rounded border-base accent-brand-600" />
                        </div>
                        <div className="mt-3 min-w-0 md:mt-0">
                          <span className="text-[10px] font-semibold uppercase text-faint md:hidden">Category</span>
                          <p className="mt-1 truncate text-sm font-semibold text-default md:mt-0 md:whitespace-normal">{CATEGORY_LABELS[row.categoryId] || `Category ${row.categoryId}`}</p>
                        </div>
                        <div className="mt-3 min-w-0 md:mt-0">
                          <span className="text-[10px] font-semibold uppercase text-faint md:hidden">Type</span>
                          <p className="mt-1 truncate text-sm text-muted md:mt-0">{row.type === "EOL" ? "EOL" : "Recycling"}</p>
                        </div>
                        <div className="mt-3 md:mt-0">
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-faint md:hidden">Target Qty</label>
                          <input type="number" className="input-field h-10 w-full min-w-0 rounded-xl !px-3 !py-0" value={row.quantity} min="0" step="0.01" onChange={(event) => updateRow({ quantity: event.target.value })} />
                        </div>
                        <div className="mt-3 md:mt-0">
                          <div className="mb-1 flex items-center justify-between md:hidden"><label className="text-[10px] font-semibold uppercase text-faint">Rate</label><span className="text-[10px] text-faint">{row.rateSource === "transaction" ? "Transaction" : "Editable"}</span></div>
                          <input type="number" className="input-field h-10 w-full min-w-0 rounded-xl !px-3 !py-0" value={row.rate} min="0" step="0.01" placeholder="Manual" onChange={(event) => updateRow({ rate: event.target.value, rateSource: "manual" })} />
                        </div>
                        <div className="mt-3 md:mt-0">
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-faint md:hidden">GST %</label>
                          <input type="number" className="input-field h-10 w-full min-w-0 rounded-xl !px-3 !py-0" value={row.gstPercent} min="0" step="0.01" onChange={(event) => updateRow({ gstPercent: event.target.value })} />
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-3 md:mt-0 md:block md:border-0 md:pt-0 md:text-right dark:border-white/[0.08]">
                          <span className="text-[10px] font-semibold uppercase text-faint md:hidden">Total</span>
                          <span className="font-semibold tabular-nums text-default">{formatCurrency(total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-base bg-card p-3">
                  <div>
                    <p className="text-xs text-faint">GST-inclusive total</p>
                    <p className="text-lg font-bold text-default">{formatCurrency(targetRowsTotal)}</p>
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => setForm((current) => ({ ...current, targetCharges: targetRowsTotal.toFixed(2) }))} disabled={targetRowsTotal <= 0}>
                    Apply to Target Charges
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="rounded-[24px] border border-black/[0.07] bg-white p-4 shadow-[0_16px_50px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:p-5 dark:border-white/[0.09] dark:bg-white/[0.035]">
          <div className="mb-4 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#f5f5f7] text-brand-600 dark:bg-white/[0.08]"><Target className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-default">Charges</p><p className="text-xs text-muted">Enter GST-inclusive billing amounts.</p></div></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Govt Charges</label><input type="number" className="input-field h-12 rounded-2xl" value={form.govtCharges} onChange={(e) => setForm({ ...form, govtCharges: e.target.value })} min="0" step="0.01" /></div>
          <div><label className="label">Consultancy Charges</label><input type="number" className="input-field h-12 rounded-2xl" value={form.consultancyCharges} onChange={(e) => setForm({ ...form, consultancyCharges: e.target.value })} min="0" step="0.01" /></div>
          <div><label className="label">Target Charges</label><input type="number" className="input-field h-12 rounded-2xl" value={form.targetCharges} onChange={(e) => setForm({ ...form, targetCharges: e.target.value })} min="0" step="0.01" /></div>
          <div><label className="label">Other Charges</label><input type="number" className="input-field h-12 rounded-2xl" value={form.otherCharges} onChange={(e) => setForm({ ...form, otherCharges: e.target.value })} min="0" step="0.01" /></div>
          </div>
        </section>
        <section className="grid gap-4 rounded-[24px] border border-black/[0.07] bg-[#f5f5f7]/75 p-4 sm:grid-cols-2 sm:rounded-[30px] sm:p-5 dark:border-white/[0.09] dark:bg-white/[0.045]">
        <div><label className="label">Notes</label><textarea className="input-field min-h-24 rounded-2xl bg-white dark:bg-white/[0.06]" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional billing context" /></div>
        <div>
          <label className="label">Due Date <span className="text-faint font-normal">(optional)</span></label>
          <input type="date" className="input-field h-12 rounded-2xl bg-white dark:bg-white/[0.06]" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <p className="text-xs text-faint mt-1">Set a deadline to track overdue status.</p>
        </div>
        </section>
            </div>

            <aside className="xl:sticky xl:top-0 xl:self-start">
              <div className="overflow-hidden rounded-[28px] border border-black/[0.07] bg-gradient-to-br from-white to-[#f2f3f7] p-5 text-default shadow-[0_24px_65px_rgba(15,23,42,0.10)] sm:p-6 dark:border-white/[0.10] dark:from-[#242426] dark:to-[#303034] dark:text-white dark:shadow-[0_24px_65px_rgba(0,0,0,0.28)]">
                <div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted dark:text-white/55">Billing total</p><CalendarDays className="h-4 w-4 text-faint dark:text-white/40" /></div>
                <p className="mt-3 text-3xl font-bold tracking-[-0.04em] text-default sm:text-4xl dark:text-white">{formatCurrency(formTotal)}</p>
                <div className="my-5 h-px bg-black/[0.08] dark:bg-white/10" />
                <div className="space-y-3 text-sm">
                  {[["Government", form.govtCharges], ["Consultancy", form.consultancyCharges], ["Targets", form.targetCharges], ["Other", form.otherCharges]].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4"><span className="text-muted dark:text-white/55">{label}</span><span className="font-mono font-medium tabular-nums text-default dark:text-white">{formatCurrency(Number(value || 0))}</span></div>
                  ))}
                </div>
                {selectedBillingClient && <div className="mt-6 rounded-[18px] border border-black/[0.05] bg-white/75 p-3.5 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.08] dark:shadow-none"><p className="truncate text-sm font-semibold text-default dark:text-white">{selectedBillingClient.companyName}</p><p className="mt-1 text-xs text-muted dark:text-white/55">{form.financialYear} annual billing</p></div>}
              </div>
            </aside>
          </div>
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-black/[0.06] bg-white/80 px-4 py-3 backdrop-blur-2xl sm:flex sm:justify-end sm:px-8 sm:py-4 dark:border-white/[0.08] dark:bg-black/20">
          <button type="button" className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 text-sm font-semibold text-default transition hover:bg-[#f5f5f7] active:scale-[0.98] dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50" disabled={saving}>{!saving && <Check className="h-4 w-4" />}{saving ? "Saving..." : editingBilling ? "Update Billing" : "Save Billing"}</button>
        </footer>
      </form>
    </Modal>
  );
}
