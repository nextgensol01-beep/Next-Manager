"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Send } from "lucide-react";
import Modal from "@/components/ui/Modal";
import type { Billing, Client, EmailOption } from "./types";
import { buildLinkedContactEmailOptions, restoreSuggestion } from "./helpers";

interface EmailReminderModalProps {
  billing: Billing | null;
  clients: Client[];
  onClose: () => void;
}

function buildReminderHtml(template: string, billing: Billing, clientName: string) {
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const breakdownRows = [
    billing.govtCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Govt Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.govtCharges)}</td></tr>` : "",
    billing.consultancyCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Consultancy Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.consultancyCharges)}</td></tr>` : "",
    billing.targetCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Target Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.targetCharges)}</td></tr>` : "",
    billing.otherCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Other Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.otherCharges)}</td></tr>` : "",
  ].join("");

  return template
    .replace(/{{clientName}}/g, clientName)
    .replace(/{{financialYear}}/g, billing.financialYear)
    .replace(/{{pendingAmount}}/g, fmt(billing.pendingAmount))
    .replace(/{{totalAmount}}/g, fmt(billing.totalAmount))
    .replace(/{{totalPaid}}/g, fmt(billing.totalPaid))
    .replace(/{{breakdownRows}}/g, breakdownRows);
}

export default function EmailReminderModal({ billing, clients, onClose }: EmailReminderModalProps) {
  const [form, setForm] = useState({ subject: "", message: "" });
  const [recipients, setRecipients] = useState<EmailOption[]>([]);
  const [suggestions, setSuggestions] = useState<EmailOption[]>([]);
  const [suggestionCatalog, setSuggestionCatalog] = useState<EmailOption[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [reminderPreviewHtml, setReminderPreviewHtml] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!billing) return;
    const client = clients.find((entry) => entry.clientId === billing.clientId);
    const cName = client?.companyName || billing.clientId;
    const { selected, suggestions: nextSuggestions } = buildLinkedContactEmailOptions(client?.contacts || []);

    setRecipients(selected);
    setSuggestions(nextSuggestions);
    setSuggestionCatalog(nextSuggestions);
    setCustomEmail("");
    setReminderPreviewHtml(null);
    setReminderLoading(true);
    setForm({ subject: `Payment Reminder — ${cName} — FY ${billing.financialYear}`, message: "" });

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/email/template?name=payment-reminder");
        const { html: template } = await response.json();
        if (!cancelled) setReminderPreviewHtml(buildReminderHtml(template, billing, cName));
      } catch {
        if (!cancelled) setReminderPreviewHtml(null);
      } finally {
        if (!cancelled) setReminderLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [billing, clients]);

  const addCustomEmail = () => {
    const email = customEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email address");
      return;
    }
    if (recipients.find((recipient) => recipient.email === email)) {
      toast.error("Already added");
      return;
    }
    setRecipients([...recipients, { label: email, email }]);
    setCustomEmail("");
  };

  const addSuggestedRecipient = (suggestion: EmailOption) => {
    if (recipients.find((recipient) => recipient.email === suggestion.email)) return;
    setRecipients((prev) => [...prev, suggestion]);
    setSuggestions((prev) => prev.filter((entry) => entry.email !== suggestion.email));
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((recipient) => recipient.email !== email));
    setSuggestions((prev) => restoreSuggestion(email, prev, suggestionCatalog));
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billing) return;
    if (recipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    setSaving(true);
    try {
      const client = clients.find((entry) => entry.clientId === billing.clientId);
      const results = await Promise.all(recipients.map((recipient) => fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.email,
          subject: form.subject,
          ...(reminderPreviewHtml ? { reminderHtml: reminderPreviewHtml } : { message: form.message }),
          logType: "payment_reminder",
          logClientId: billing.clientId,
          logClientName: client?.companyName || billing.clientId,
          logFy: billing.financialYear,
        }),
      }).then((res) => res.json())));
      const failed = results.filter((data) => !data.success);
      if (failed.length > 0) toast.error(`${failed.length} email(s) failed`);
      else {
        toast.success(`Reminder sent to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}!`);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(billing)} onClose={onClose} title="Send Payment Reminder" size="lg">
      <form onSubmit={sendEmail} className="space-y-4">
        <div>
          <label className="label">Recipients *</label>
          <div className={`min-h-[44px] w-full rounded-lg border px-3 py-2 flex flex-wrap gap-2 items-center transition-colors ${recipients.length === 0 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10" : "border-base bg-card"}`}>
            {recipients.map((recipient) => (
              <span key={recipient.email} className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium px-2.5 py-1 rounded-full">
                <span className="max-w-[200px] truncate" title={recipient.email}>{recipient.label !== recipient.email ? <><span className="font-semibold">{recipient.label}</span><span className="opacity-60 ml-1">· {recipient.email}</span></> : recipient.email}</span>
                <button type="button" onClick={() => removeRecipient(recipient.email)} className="text-brand-400 hover:text-red-500 transition-colors ml-0.5 flex-shrink-0" title="Remove">x</button>
              </span>
            ))}
            {recipients.length === 0 && <span className="text-xs text-red-400">No recipients - add an email below</span>}
          </div>
          <p className="text-xs text-faint mt-1">Auto-filled from linked contacts. Click x to remove.</p>
        </div>
        {suggestions.length > 0 && (
          <div>
            <label className="label">Suggestions</label>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button key={suggestion.email} type="button" onClick={() => addSuggestedRecipient(suggestion)} className="rounded-full border border-base px-3 py-1 text-xs text-faint transition-colors hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300">
                  {suggestion.label !== suggestion.email ? `${suggestion.label} - ${suggestion.email}` : suggestion.email}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="label">Add Another Recipient</label>
          <div className="flex gap-2">
            <input type="email" className="input-field flex-1" placeholder="any.email@domain.com" value={customEmail} onChange={(e) => setCustomEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomEmail(); } }} />
            <button type="button" onClick={addCustomEmail} className="btn-secondary !px-3 shrink-0">+ Add</button>
          </div>
        </div>
        <div><label className="label">Subject *</label><input className="input-field" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></div>
        {reminderLoading ? (
          <div className="h-[280px] animate-pulse rounded-xl bg-surface" />
        ) : reminderPreviewHtml ? (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30">
              <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Branded reminder template will be sent</p>
            </div>
            <iframe srcDoc={reminderPreviewHtml} className="w-full border-0" style={{ height: 280 }} title="Reminder Preview" />
          </div>
        ) : (
          <div><label className="label">Message *</label><textarea className="input-field" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving || recipients.length === 0}>
            <Send className="w-4 h-4" />{saving ? "Sending..." : `Send to ${recipients.length} Recipient${recipients.length !== 1 ? "s" : ""}`}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
