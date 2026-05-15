"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils";
import type { Billing } from "./types";

interface ApplyAdvanceModalProps {
  billing: Billing | null;
  advanceBalance: number;
  clientName: (clientId: string) => string;
  onOptimisticApply: (input: { clientId: string; financialYear: string; amountToApply: number; applyDate: string; notes?: string }) => () => void;
  onClose: () => void;
  onApplied: () => void;
}

const todayInput = () => new Date().toISOString().split("T")[0];

export default function ApplyAdvanceModal({ billing, advanceBalance, clientName, onOptimisticApply, onClose, onApplied }: ApplyAdvanceModalProps) {
  const [form, setForm] = useState({ clientId: "", financialYear: "", amountToApply: "", applyDate: todayInput(), notes: "" });
  const [saving, setSaving] = useState(false);
  const maxApply = useMemo(() => billing ? Math.min(advanceBalance, billing.pendingAmount) : 0, [advanceBalance, billing]);

  useEffect(() => {
    if (!billing) return;
    const suggested = Math.min(advanceBalance, billing.pendingAmount);
    setForm({
      clientId: billing.clientId,
      financialYear: billing.financialYear,
      amountToApply: suggested > 0 ? suggested.toFixed(2) : "",
      applyDate: todayInput(),
      notes: "",
    });
  }, [advanceBalance, billing]);

  const saveApplyAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billing) return;
    const amountToApply = Number(form.amountToApply);
    setSaving(true);
    const rollback = onOptimisticApply({
      clientId: form.clientId,
      financialYear: form.financialYear,
      amountToApply,
      applyDate: form.applyDate,
      notes: form.notes,
    });
    try {
      const response = await fetch("/api/payments/apply-advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountToApply }),
      });
      if (!response.ok) {
        rollback();
        const data = await response.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to apply advance");
        return;
      }
      toast.success("Advance applied to billing!");
      onApplied();
    } catch {
      rollback();
      toast.error("Failed to apply advance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(billing)} onClose={onClose} title="Apply Advance to Billing">
      {billing && (
        <form onSubmit={saveApplyAdvance} className="space-y-4">
          <div className="rounded-xl border border-base bg-surface p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted">Client</span><span className="font-medium text-default">{clientName(billing.clientId)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted">Financial Year</span><span className="font-medium text-default">FY {billing.financialYear}</span></div>
            <div className="border-t border-base my-1" />
            <div className="flex justify-between text-sm"><span className="text-muted">Advance balance</span><span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(advanceBalance)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted">Pending billing</span><span className="font-semibold text-red-500">{formatCurrency(billing.pendingAmount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted">Max you can apply</span><span className="font-semibold text-default">{formatCurrency(maxApply)}</span></div>
          </div>
          <div>
            <label className="label">Amount to Apply *</label>
            <input type="number" className="input-field" value={form.amountToApply} onChange={(e) => setForm({ ...form, amountToApply: e.target.value })} min="0.01" max={maxApply} step="0.01" placeholder="0.00" required />
            {Number(form.amountToApply) > 0 && Number(form.amountToApply) <= maxApply && (
              <p className="text-xs text-faint mt-1">
                After applying: advance balance {"->"} <span className="font-medium text-default">{formatCurrency(advanceBalance - Number(form.amountToApply))}</span>, pending billing {"->"} <span className="font-medium text-default">{formatCurrency(billing.pendingAmount - Number(form.amountToApply))}</span>
              </p>
            )}
          </div>
          <div>
            <label className="label">Apply Date *</label>
            <input type="date" className="input-field" value={form.applyDate} onChange={(e) => setForm({ ...form, applyDate: e.target.value })} required />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional note" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving || Number(form.amountToApply) <= 0 || Number(form.amountToApply) > maxApply}>
              {saving ? "Applying..." : `Apply ${form.amountToApply ? formatCurrency(Number(form.amountToApply)) : ""}`}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
