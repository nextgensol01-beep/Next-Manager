"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils";
import type { Billing } from "./types";
import { dateInputValue } from "./helpers";

interface InvoiceModalProps {
  billing: Billing | null;
  clientName: (clientId: string) => string;
  onClose: () => void;
  onSaved: () => void;
}

export default function InvoiceModal({ billing, clientName, onClose, onSaved }: InvoiceModalProps) {
  const [form, setForm] = useState({ invoiceNumber: "", invoiceDate: "", invoiceAmount: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!billing) return;
    setForm({
      invoiceNumber: billing.invoiceNumber || "",
      invoiceDate: dateInputValue(billing.invoiceDate),
      invoiceAmount: billing.invoiceAmount != null ? String(billing.invoiceAmount) : "",
    });
  }, [billing]);

  const saveInvoiceStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billing) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/billing/${billing._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceCreated: true,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate || null,
          invoiceAmount: form.invoiceAmount !== "" ? Number(form.invoiceAmount) : null,
        }),
      });
      if (!response.ok) {
        toast.error("Failed to update invoice status");
        return;
      }
      toast.success("Invoice marked as created");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(billing)} onClose={onClose} title={billing?.invoiceCreated ? "Edit Invoice Details" : "Mark Invoice as Created"}>
      {billing && (
        <form onSubmit={saveInvoiceStatus} className="space-y-4">
          <div className="rounded-xl border border-base bg-surface p-3 text-sm">
            <p className="text-faint text-xs mb-1">Client</p>
            <p className="font-medium text-default">{clientName(billing.clientId)}</p>
            <p className="text-xs text-faint mt-0.5">FY {billing.financialYear} - {formatCurrency(billing.totalAmount)}</p>
          </div>
          <div>
            <label className="label">Invoice Number <span className="text-faint font-normal">(optional)</span></label>
            <input className="input-field" placeholder="e.g. INV-2025-001" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
          </div>
          <div>
            <label className="label">Invoice Date <span className="text-faint font-normal">(optional)</span></label>
            <input type="date" className="input-field" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Invoice Amount <span className="text-faint font-normal">(optional)</span></label>
            <input type="number" className="input-field" placeholder={String(billing.totalAmount)} value={form.invoiceAmount} min="0" step="0.01" onChange={(e) => setForm({ ...form, invoiceAmount: e.target.value })} />
            <p className="text-xs text-faint mt-1">Leave blank to use the billing total ({formatCurrency(billing.totalAmount)}).</p>
          </div>
          <p className="text-xs text-faint">Helps your accountant track which clients already have an invoice prepared.</p>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : "Mark as Invoice Created"}</button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
