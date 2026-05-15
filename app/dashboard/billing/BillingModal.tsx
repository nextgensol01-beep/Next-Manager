"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
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
    <Modal open={open} onClose={onClose} title={editingBilling ? "Edit Billing" : "Add / Update Billing"}>
      <form onSubmit={saveBilling} className="space-y-4">
        <div>
          <label className="label">Client *</label>
          <select className="input-field" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required disabled={Boolean(editingBilling)}>
            <option value="">Select Client</option>
            {clients.map((client) => <option key={client.clientId} value={client.clientId}>{client.companyName}</option>)}
          </select>
          {editingBilling && <p className="text-xs text-faint mt-1">Client cannot be changed while editing.</p>}
        </div>
        <div>
          <label className="label">Financial Year *</label>
          <select className="input-field" value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} required disabled={Boolean(editingBilling)}>
            {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          {editingBilling && <p className="text-xs text-faint mt-1">Financial year is locked to prevent duplicate records.</p>}
        </div>

        {form.clientId && (
          <div className="rounded-2xl border border-base bg-surface p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-default">PIBO Target Suggestions</p>
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead><tr className="text-left text-xs uppercase text-faint">
                      <th className="py-2 pr-3">Use</th>
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Target Qty</th>
                      <th className="py-2 pr-3">Rate</th>
                      <th className="py-2 pr-3">GST %</th>
                      <th className="py-2 text-right">Total</th>
                    </tr></thead>
                    <tbody>
                      {targetRows.map((row) => {
                        const taxable = Number(row.quantity || 0) * Number(row.rate || 0);
                        const gstAmt = taxable * (Number(row.gstPercent || 0) / 100);
                        const total = taxable + gstAmt;
                        return (
                          <tr key={row.key} className="border-t border-soft">
                            <td className="py-2 pr-3"><input type="checkbox" checked={row.include} onChange={(ev) => setTargetRows((rows) => rows.map((r) => r.key === row.key ? { ...r, include: ev.target.checked } : r))} className="h-4 w-4 rounded border-base" /></td>
                            <td className="py-2 pr-3 text-default">{CATEGORY_LABELS[row.categoryId] || `Category ${row.categoryId}`}</td>
                            <td className="py-2 pr-3 text-muted">{row.type === "EOL" ? "EOL" : "Recycling"}</td>
                            <td className="py-2 pr-3"><input type="number" className="input-field !py-1.5" value={row.quantity} min="0" step="0.01" onChange={(ev) => setTargetRows((rows) => rows.map((r) => r.key === row.key ? { ...r, quantity: ev.target.value } : r))} /></td>
                            <td className="py-2 pr-3">
                              <input type="number" className="input-field !py-1.5" value={row.rate} min="0" step="0.01" placeholder="Manual" onChange={(ev) => setTargetRows((rows) => rows.map((r) => r.key === row.key ? { ...r, rate: ev.target.value, rateSource: "manual" } : r))} />
                              <p className="text-[10px] text-faint mt-0.5">{row.rateSource === "transaction" ? "From transaction" : "Editable"}</p>
                            </td>
                            <td className="py-2 pr-3"><input type="number" className="input-field !py-1.5" value={row.gstPercent} min="0" step="0.01" onChange={(ev) => setTargetRows((rows) => rows.map((r) => r.key === row.key ? { ...r, gstPercent: ev.target.value } : r))} /></td>
                            <td className="py-2 text-right font-semibold text-default">{formatCurrency(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Govt Charges</label><input type="number" className="input-field" value={form.govtCharges} onChange={(e) => setForm({ ...form, govtCharges: e.target.value })} min="0" step="0.01" /></div>
          <div><label className="label">Consultancy Charges</label><input type="number" className="input-field" value={form.consultancyCharges} onChange={(e) => setForm({ ...form, consultancyCharges: e.target.value })} min="0" step="0.01" /></div>
          <div><label className="label">Target Charges</label><input type="number" className="input-field" value={form.targetCharges} onChange={(e) => setForm({ ...form, targetCharges: e.target.value })} min="0" step="0.01" /></div>
          <div><label className="label">Other Charges</label><input type="number" className="input-field" value={form.otherCharges} onChange={(e) => setForm({ ...form, otherCharges: e.target.value })} min="0" step="0.01" /></div>
        </div>
        {formTotal > 0 && (
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 text-center border border-brand-100 dark:border-brand-800">
            <p className="text-xs text-muted">Total Amount</p>
            <p className="text-xl font-bold text-brand-700 dark:text-brand-400">{formatCurrency(formTotal)}</p>
          </div>
        )}
        <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div>
          <label className="label">Due Date <span className="text-faint font-normal">(optional)</span></label>
          <input type="date" className="input-field" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <p className="text-xs text-faint mt-1">Set a deadline to track overdue status.</p>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : editingBilling ? "Update Billing" : "Save Billing"}</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
