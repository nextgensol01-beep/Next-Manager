"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { FINANCIAL_YEARS, PAYMENT_MODES } from "@/lib/utils";
import type { Billing, Client, Payment } from "./types";

type PaymentModalTarget = false | "advance" | Billing;

type PaymentForm = {
  clientId: string;
  financialYear: string;
  paymentType: "billing" | "advance";
  amountPaid: string;
  paymentDate: string;
  paymentMode: string;
  referenceNumber: string;
  notes: string;
};

interface PaymentModalProps {
  target: PaymentModalTarget;
  clients: Client[];
  fy: string;
  effectiveFinancialYear: string;
  onOptimisticPayment: (payment: Omit<Payment, "_id">) => () => void;
  onClose: () => void;
  onSaved: () => void;
}

const todayInput = () => new Date().toISOString().split("T")[0];

function formForTarget(target: PaymentModalTarget, fy: string): PaymentForm {
  if (target && target !== "advance") {
    return {
      clientId: target.clientId,
      financialYear: target.financialYear,
      paymentType: "billing",
      amountPaid: "",
      paymentDate: todayInput(),
      paymentMode: "NEFT",
      referenceNumber: "",
      notes: "",
    };
  }

  return {
    clientId: "",
    financialYear: fy,
    paymentType: "advance",
    amountPaid: "",
    paymentDate: todayInput(),
    paymentMode: "NEFT",
    referenceNumber: "",
    notes: "",
  };
}

export default function PaymentModal({ target, clients, fy, effectiveFinancialYear, onOptimisticPayment, onClose, onSaved }: PaymentModalProps) {
  const [form, setForm] = useState<PaymentForm>(() => formForTarget(target, fy));
  const [saving, setSaving] = useState(false);
  const open = Boolean(target);
  const isAdvancePayment = form.paymentType === "advance";
  const selectedPaymentClient = useMemo(() => clients.find((client) => client.clientId === form.clientId), [clients, form.clientId]);

  useEffect(() => {
    if (!open) return;
    setForm(formForTarget(target, fy));
  }, [fy, open, target]);

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const rollback = onOptimisticPayment({
      clientId: form.clientId,
      financialYear: form.financialYear,
      amountPaid: Number(form.amountPaid),
      paymentType: form.paymentType,
      paymentDate: form.paymentDate,
      paymentMode: form.paymentMode,
      referenceNumber: form.referenceNumber,
      notes: form.notes,
      source: "direct",
    });
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountPaid: Number(form.amountPaid) }),
      });
      if (!response.ok) {
        rollback();
        const data = await response.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Error saving payment");
        return;
      }
      toast.success(form.paymentType === "advance" ? "Advance payment recorded!" : "Payment added!");
      onSaved();
    } catch {
      rollback();
      toast.error("Error saving payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isAdvancePayment ? "Record Advance Payment" : "Add Payment"}>
      <form onSubmit={savePayment} className="space-y-4">
        <div>
          <label className="label">Payment Type *</label>
          <select className="input-field" value={form.paymentType} onChange={(e) => setForm((current) => ({ ...current, paymentType: e.target.value === "advance" ? "advance" : "billing" }))}>
            <option value="billing">Billing Payment</option>
            <option value="advance">Advance Payment</option>
          </select>
          <p className="text-xs text-faint mt-1">
            {isAdvancePayment
              ? "Advance payments stay separate until you apply them to a billing record."
              : "Billing payments are applied against the selected client and financial year."}
          </p>
        </div>
        {isAdvancePayment ? (
          <>
            <div>
              <label className="label">Client *</label>
              <select className="input-field" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
                <option value="">Select Client</option>
                {clients.map((client) => <option key={client.clientId} value={client.clientId}>{client.companyName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Financial Year *</label>
              <select className="input-field" value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} required>
                {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Client</label>
              <div className="input-field bg-surface text-muted flex items-center">{selectedPaymentClient?.companyName || form.clientId || "-"}</div>
            </div>
            <div>
              <label className="label">Financial Year</label>
              <div className="input-field bg-surface text-muted flex items-center">{form.financialYear || effectiveFinancialYear}</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Amount Paid *</label><input type="number" className="input-field" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} required min="1" step="0.01" placeholder="0.00" /></div>
          <div><label className="label">Payment Date *</label><input type="date" className="input-field" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} required /></div>
        </div>
        <div>
          <label className="label">Payment Mode *</label>
          <select className="input-field" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })} required>
            {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </div>
        <div><label className="label">Reference Number</label><input className="input-field" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} placeholder="UTR / Cheque number" /></div>
        <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : isAdvancePayment ? "Record Advance" : "Record Payment"}</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export type { PaymentModalTarget };
