"use client";
import React, { useState, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { FINANCIAL_YEARS, formatCurrency, formatDate, PAYMENT_MODES, getPaymentPercentage } from "@/lib/utils";
import { Plus, Send, FileText, ChevronDown, ChevronUp, Trash2, Search, X } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";

interface ClientContact { _id: string; name: string; email?: string; emails?: string[]; allEmails?: string[]; mobile?: string; }
interface Client { clientId: string; companyName: string; category: string; contacts?: ClientContact[]; }
interface Billing { _id: string; clientId: string; financialYear: string; govtCharges: number; consultancyCharges: number; targetCharges: number; otherCharges: number; totalAmount: number; notes?: string; totalPaid: number; pendingAmount: number; paymentStatus: string; }
interface Payment { _id: string; clientId: string; financialYear: string; amountPaid: number; paymentType?: "billing" | "advance"; paymentDate: string; paymentMode: string; referenceNumber?: string; notes?: string; }
interface EmailOption { label: string; email: string; }

function restoreSuggestion(email: string, currentSuggestions: EmailOption[], catalog: EmailOption[]) {
  if (currentSuggestions.some((entry) => entry.email === email)) return currentSuggestions;

  const match = catalog.find((entry) => entry.email === email);
  if (!match) return currentSuggestions;

  const orderedSuggestions = catalog.filter((entry) =>
    entry.email === email || currentSuggestions.some((current) => current.email === entry.email)
  );

  return orderedSuggestions.map((entry) =>
    entry.email === email ? match : currentSuggestions.find((current) => current.email === entry.email) || entry
  );
}

function buildLinkedContactEmailOptions(contacts: ClientContact[]) {
  const selected: EmailOption[] = [];
  const suggestions: EmailOption[] = [];
  const selectedSet = new Set<string>();
  const suggestionSet = new Set<string>();

  contacts.forEach((contact) => {
    const selectedEmails = Array.from(new Set((contact.emails || []).filter(Boolean)));
    const suggestedEmails = Array.from(
      new Set((contact.allEmails || []).filter((email) => email && !selectedEmails.includes(email)))
    );

    selectedEmails.forEach((email) => {
      if (selectedSet.has(email)) return;
      selectedSet.add(email);
      selected.push({ label: contact.name, email });
    });

    suggestedEmails.forEach((email) => {
      if (selectedSet.has(email) || suggestionSet.has(email)) return;
      suggestionSet.add(email);
      suggestions.push({ label: contact.name, email });
    });
  });

  return { selected, suggestions };
}

export default function BillingPage() {
  const [fy, setFy] = useFinancialYearState();
  const { effectiveFinancialYear } = useFinancialYearPreference();
  const [billingModal, setBillingModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [bForm, setBForm] = useState({ clientId: "", financialYear: effectiveFinancialYear, govtCharges: "0", consultancyCharges: "0", targetCharges: "0", otherCharges: "0", notes: "" });
  const [pForm, setPForm] = useState({
    clientId: "",
    financialYear: effectiveFinancialYear,
    paymentType: "billing" as "billing" | "advance",
    amountPaid: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMode: "NEFT",
    referenceNumber: "",
    notes: "",
  });
  const [emailForm, setEmailForm] = useState({ subject: "", message: "" });
  const [emailRecipients, setEmailRecipients] = useState<EmailOption[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<EmailOption[]>([]);
  const [emailSuggestionCatalog, setEmailSuggestionCatalog] = useState<EmailOption[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [activeBilling, setActiveBilling] = useState<Billing | null>(null);
  const [reminderPreviewHtml, setReminderPreviewHtml] = useState<string | null>(null);

  const { data: billings, loading: bLoading, refetch: refetchBillings } = useCache<Billing[]>(`/api/billing?fy=${fy}`, { initialData: [] });
  const { data: payments, refetch: refetchPayments } = useCache<Payment[]>(`/api/payments?fy=${fy}`, { initialData: [] });
  const { data: clients } = useCache<Client[]>("/api/clients", { initialData: [] });
  const loading = bLoading;

  const clientName = useCallback((id: string) => clients.find((c) => c.clientId === id)?.companyName || id, [clients]);
  const clientPayments = (id: string) => payments.filter((p) => p.clientId === id && p.paymentType !== "advance");

  const filteredBillings = useMemo(() => {
    if (!search.trim()) return billings;
    const q = search.toLowerCase();
    return billings.filter((b) => {
      const name = clientName(b.clientId).toLowerCase();
      return name.includes(q) || b.clientId.toLowerCase().includes(q) || b.paymentStatus.toLowerCase().includes(q);
    });
  }, [billings, search, clientName]);

  const openBillingModal = () => {
    setBForm({
      clientId: "",
      financialYear: fy,
      govtCharges: "0",
      consultancyCharges: "0",
      targetCharges: "0",
      otherCharges: "0",
      notes: "",
    });
    setBillingModal(true);
  };

  const openPaymentModal = (billing: Billing) => {
    setPForm({
      clientId: billing.clientId,
      financialYear: billing.financialYear,
      paymentType: "billing",
      amountPaid: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMode: "NEFT",
      referenceNumber: "",
      notes: "",
    });
    setPaymentModal(true);
  };

  const openAdvancePaymentModal = () => {
    setPForm({
      clientId: "",
      financialYear: fy,
      paymentType: "advance",
      amountPaid: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMode: "NEFT",
      referenceNumber: "",
      notes: "",
    });
    setPaymentModal(true);
  };

  const openEmailModal = async (billing: Billing) => {
    const client = clients.find((c) => c.clientId === billing.clientId);
    const cName = client?.companyName || billing.clientId;

    const { selected, suggestions } = buildLinkedContactEmailOptions(client?.contacts || []);

    setActiveBilling(billing);
    setEmailRecipients(selected);
    setEmailSuggestions(suggestions);
    setEmailSuggestionCatalog(suggestions);
    setCustomEmail("");
    setEmailForm({ subject: `Payment Reminder — ${cName} — FY ${billing.financialYear}`, message: "" });

    // Build reminder HTML from template
    try {
      const tmplRes = await fetch("/api/email/template?name=payment-reminder");
      const { html: template } = await tmplRes.json();
      const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const breakdownRows = [
        billing.govtCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Govt Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.govtCharges)}</td></tr>` : "",
        billing.consultancyCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Consultancy Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.consultancyCharges)}</td></tr>` : "",
        billing.targetCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Target Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.targetCharges)}</td></tr>` : "",
        billing.otherCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Other Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(billing.otherCharges)}</td></tr>` : "",
      ].join("");
      const html = template
        .replace(/{{clientName}}/g, cName)
        .replace(/{{financialYear}}/g, billing.financialYear)
        .replace(/{{pendingAmount}}/g, fmt(billing.pendingAmount))
        .replace(/{{totalAmount}}/g, fmt(billing.totalAmount))
        .replace(/{{totalPaid}}/g, fmt(billing.totalPaid))
        .replace(/{{breakdownRows}}/g, breakdownRows);
      setReminderPreviewHtml(html);
    } catch { setReminderPreviewHtml(null); }

    setEmailModal(true);
  };

  const addCustomEmail = () => {
    const email = customEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Invalid email address"); return; }
    if (emailRecipients.find((r) => r.email === email)) { toast.error("Already added"); return; }
    setEmailRecipients([...emailRecipients, { label: email, email }]);
    setCustomEmail("");
  };

  const addSuggestedRecipient = (suggestion: EmailOption) => {
    if (emailRecipients.find((entry) => entry.email === suggestion.email)) return;
    setEmailRecipients((prev) => [...prev, suggestion]);
    setEmailSuggestions((prev) => prev.filter((entry) => entry.email !== suggestion.email));
  };

  const removeRecipient = (email: string) => {
    setEmailRecipients((prev) => prev.filter((entry) => entry.email !== email));
    setEmailSuggestions((prev) => restoreSuggestion(email, prev, emailSuggestionCatalog));
  };

  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...bForm, govtCharges: Number(bForm.govtCharges), consultancyCharges: Number(bForm.consultancyCharges), targetCharges: Number(bForm.targetCharges), otherCharges: Number(bForm.otherCharges) }) });
      if (!r.ok) { toast.error("Error saving billing"); return; }
      toast.success("Billing saved!");
      setBillingModal(false);
      invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments();
    } finally { setSaving(false); }
  };

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pForm, amountPaid: Number(pForm.amountPaid) }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Error saving payment");
        return;
      }
      toast.success(pForm.paymentType === "advance" ? "Advance payment recorded!" : "Payment added!");
      setPaymentModal(false);
      invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments();
    } finally { setSaving(false); }
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailRecipients.length === 0) { toast.error("Add at least one recipient"); return; }
    setSaving(true);
    try {
      const client = clients.find((c) => c.clientId === activeBilling?.clientId);
      const results = await Promise.all(
        emailRecipients.map((r) =>
          fetch("/api/email/send", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: r.email, subject: emailForm.subject,
              ...(reminderPreviewHtml ? { reminderHtml: reminderPreviewHtml } : { message: emailForm.message }),
              logType: "payment_reminder",
              logClientId: activeBilling?.clientId || "",
              logClientName: client?.companyName || activeBilling?.clientId || "",
              logFy: activeBilling?.financialYear || "",
            }),
          }).then((res) => res.json())
        )
      );
      const failed = results.filter((d) => !d.success);
      if (failed.length > 0) toast.error(`${failed.length} email(s) failed`);
      else { toast.success(`Reminder sent to ${emailRecipients.length} recipient${emailRecipients.length !== 1 ? "s" : ""}!`); setEmailModal(false); }
    } finally { setSaving(false); }
  };

  const bFormTotal = Number(bForm.govtCharges) + Number(bForm.consultancyCharges) + Number(bForm.targetCharges) + Number(bForm.otherCharges);
  const isAdvancePayment = pForm.paymentType === "advance";
  const selectedPaymentClient = clients.find((client) => client.clientId === pForm.clientId);

  const deleteBilling = async (id: string, clientId: string) => {
    if (!confirm(`Delete billing record for ${clientName(clientId)}? This will not delete payment records.`)) return;
    const r = await fetch(`/api/billing/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Billing deleted"); invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments(); }
    else toast.error("Failed to delete");
  };

  const deletePayment = async (id: string) => {
    if (!confirm("Delete this payment record?")) return;
    const r = await fetch(`/api/payments/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Payment deleted"); invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments(); }
    else toast.error("Failed to delete");
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  return (
    <div>
      <PageHeader title="Billing & Payments" description="Manage invoices and payment collection">
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={openAdvancePaymentModal}><Plus className="w-4 h-4" /> Record Advance</button>
          <button className="btn-primary" onClick={openBillingModal}><Plus className="w-4 h-4" /> Add Billing</button>
        </div>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      {/* Search */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex items-center gap-2 transition-colors">
        <Search className="w-4 h-4 text-faint flex-shrink-0 ml-1" />
        <input
          className="bg-transparent border-0 ring-0 outline-none flex-1 py-1.5 text-sm text-default placeholder:text-faint"
          placeholder="Search by client name, ID, or payment status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="p-1 text-faint hover:text-default rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? <LoadingSpinner /> : billings.length === 0 ? (
        <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
          <EmptyState message="No billing records for this FY" description="Add billing for a client to get started" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBillings.length === 0 ? (
            <div className="bg-card rounded-2xl p-8 shadow-sm border border-base"><EmptyState message={`No results for "${search}"`} description="Try a different search term" /></div>
          ) : filteredBillings.map((billing) => {
            const expanded = expandedRows.has(billing._id);
            const cPayments = clientPayments(billing.clientId);
            const pct = getPaymentPercentage(billing.totalPaid, billing.totalAmount);
            return (
              <div key={billing._id} className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-default">{clientName(billing.clientId)}</h3>
                      <p className="text-xs text-faint">{billing.clientId} · FY {billing.financialYear}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PaymentStatusBadge status={billing.paymentStatus} />
                      <button onClick={() => deleteBilling(billing._id, billing.clientId)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete billing entry"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-surface rounded-lg p-2.5"><p className="text-xs text-muted">Govt</p><p className="font-semibold text-sm">{formatCurrency(billing.govtCharges)}</p></div>
                    <div className="bg-surface rounded-lg p-2.5"><p className="text-xs text-muted">Consultancy</p><p className="font-semibold text-sm">{formatCurrency(billing.consultancyCharges)}</p></div>
                    <div className="bg-surface rounded-lg p-2.5"><p className="text-xs text-muted">Target</p><p className="font-semibold text-sm">{formatCurrency(billing.targetCharges)}</p></div>
                    <div className="bg-surface rounded-lg p-2.5"><p className="text-xs text-muted">Other</p><p className="font-semibold text-sm">{formatCurrency(billing.otherCharges)}</p></div>
                  </div>

                  {/* Payment progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted">Collection: {Math.round(pct)}%</span>
                      <span className="text-muted">Pending: <span className="text-red-500 font-semibold">{formatCurrency(billing.pendingAmount)}</span></span>
                    </div>
                    <div className="w-full bg-surface rounded-full h-2">
                      <div className={`h-2 rounded-full ${pct >= 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-faint mt-1">
                      <span>Paid: {formatCurrency(billing.totalPaid)}</span>
                      <span>Total: {formatCurrency(billing.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-primary !py-1.5" onClick={() => openPaymentModal(billing)}><Plus className="w-3.5 h-3.5" /> Add Payment</button>
                    <button className="btn-secondary !py-1.5" onClick={() => openEmailModal(billing)}><Send className="w-3.5 h-3.5" /> Send Reminder</button>
                    <button className="btn-secondary !py-1.5" onClick={() => toggleRow(billing._id)}>
                      <FileText className="w-3.5 h-3.5" /> Payment History {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded payment history */}
                {expanded && (
                  <div className="border-t border-soft">
                    {cPayments.length === 0 ? (
                      <p className="text-center text-sm text-faint py-6">No payments recorded yet</p>
                    ) : (
                      <TableWrapper><table className="w-full min-w-[640px]">
                        <thead><tr>
                          <th className="table-header">Date</th>
                          <th className="table-header">Amount</th>
                          <th className="table-header">Mode</th>
                          <th className="table-header">Reference</th>
                          <th className="table-header">Notes</th>
                          <th className="table-header"></th>
                        </tr></thead>
                        <tbody>
                          {cPayments.map((p) => (
                            <tr key={p._id} className="hover:bg-surface">
                              <td className="table-cell whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                              <td className="table-cell font-semibold text-emerald-600">{formatCurrency(p.amountPaid)}</td>
                              <td className="table-cell whitespace-nowrap"><span className="bg-surface text-muted text-xs px-2 py-0.5 rounded">{p.paymentMode}</span></td>
                              <td className="table-cell text-faint">{p.referenceNumber || "—"}</td>
                              <td className="table-cell text-faint text-xs">{p.notes || "—"}</td>
                              <td className="table-cell whitespace-nowrap"><button onClick={() => deletePayment(p._id)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete payment"><Trash2 className="w-3.5 h-3.5" /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table></TableWrapper>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Billing Modal */}
      <Modal open={billingModal} onClose={() => setBillingModal(false)} title="Add / Update Billing">
        <form onSubmit={saveBilling} className="space-y-4">
          <div>
            <label className="label">Client *</label>
            <select className="input-field" value={bForm.clientId} onChange={(e) => setBForm({ ...bForm, clientId: e.target.value })} required>
              <option value="">Select Client</option>
              {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Financial Year *</label>
            <select className="input-field" value={bForm.financialYear} onChange={(e) => setBForm({ ...bForm, financialYear: e.target.value })} required>
              {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Govt Charges</label><input type="number" className="input-field" value={bForm.govtCharges} onChange={(e) => setBForm({ ...bForm, govtCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Consultancy Charges</label><input type="number" className="input-field" value={bForm.consultancyCharges} onChange={(e) => setBForm({ ...bForm, consultancyCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Target Charges</label><input type="number" className="input-field" value={bForm.targetCharges} onChange={(e) => setBForm({ ...bForm, targetCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Other Charges</label><input type="number" className="input-field" value={bForm.otherCharges} onChange={(e) => setBForm({ ...bForm, otherCharges: e.target.value })} min="0" step="0.01" /></div>
          </div>
          {bFormTotal > 0 && <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 text-center border border-brand-100 dark:border-brand-800"><p className="text-xs text-muted">Total Amount</p><p className="text-xl font-bold text-brand-700 dark:text-brand-400">{formatCurrency(bFormTotal)}</p></div>}
          <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={bForm.notes} onChange={(e) => setBForm({ ...bForm, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : "Save Billing"}</button>
            <button type="button" className="btn-secondary" onClick={() => setBillingModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Add Payment Modal */}
      <Modal open={paymentModal} onClose={() => setPaymentModal(false)} title={isAdvancePayment ? "Record Advance Payment" : "Add Payment"}>
        <form onSubmit={savePayment} className="space-y-4">
          <div>
            <label className="label">Payment Type *</label>
            <select
              className="input-field"
              value={pForm.paymentType}
              onChange={(e) => {
                const nextType = e.target.value === "advance" ? "advance" : "billing";
                setPForm((form) => ({ ...form, paymentType: nextType }));
              }}
            >
              <option value="billing">Billing Payment</option>
              <option value="advance">Advance Payment</option>
            </select>
            <p className="text-xs text-faint mt-1">
              {isAdvancePayment
                ? "Advance payments stay separate from invoice collection until you apply them to a billing record."
                : "Billing payments are applied against the selected client and financial year."}
            </p>
          </div>
          {isAdvancePayment ? (
            <>
              <div>
                <label className="label">Client *</label>
                <select
                  className="input-field"
                  value={pForm.clientId}
                  onChange={(e) => setPForm({ ...pForm, clientId: e.target.value })}
                  required
                >
                  <option value="">Select Client</option>
                  {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Financial Year *</label>
                <select
                  className="input-field"
                  value={pForm.financialYear}
                  onChange={(e) => setPForm({ ...pForm, financialYear: e.target.value })}
                  required
                >
                  {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Client</label>
                <div className="input-field bg-surface text-muted flex items-center">
                  {selectedPaymentClient?.companyName || pForm.clientId || "Select a billing row"}
                </div>
              </div>
              <div>
                <label className="label">Financial Year</label>
                <div className="input-field bg-surface text-muted flex items-center">
                  {pForm.financialYear || effectiveFinancialYear}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Amount Paid *</label><input type="number" className="input-field" value={pForm.amountPaid} onChange={(e) => setPForm({ ...pForm, amountPaid: e.target.value })} required min="1" step="0.01" placeholder="0.00" /></div>
            <div><label className="label">Payment Date *</label><input type="date" className="input-field" value={pForm.paymentDate} onChange={(e) => setPForm({ ...pForm, paymentDate: e.target.value })} required /></div>
          </div>
          <div>
            <label className="label">Payment Mode *</label>
            <select className="input-field" value={pForm.paymentMode} onChange={(e) => setPForm({ ...pForm, paymentMode: e.target.value })} required>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><label className="label">Reference Number</label><input className="input-field" value={pForm.referenceNumber} onChange={(e) => setPForm({ ...pForm, referenceNumber: e.target.value })} placeholder="UTR / Cheque number" /></div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={pForm.notes} onChange={(e) => setPForm({ ...pForm, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : isAdvancePayment ? "Record Advance" : "Record Payment"}</button>
            <button type="button" className="btn-secondary" onClick={() => setPaymentModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Email Modal */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="Send Payment Reminder" size="lg">
        <form onSubmit={sendEmail} className="space-y-4">

          {/* Recipients chips */}
          <div>
            <label className="label">Recipients *</label>
            <div className={`min-h-[44px] w-full rounded-lg border px-3 py-2 flex flex-wrap gap-2 items-center transition-colors ${emailRecipients.length === 0 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10" : "border-base bg-card"}`}>
              {emailRecipients.map((r) => (
                <span key={r.email} className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium px-2.5 py-1 rounded-full">
                  <span className="max-w-[200px] truncate" title={r.email}>{r.label !== r.email ? <><span className="font-semibold">{r.label}</span><span className="opacity-60 ml-1">· {r.email}</span></> : r.email}</span>
                  <button type="button" onClick={() => removeRecipient(r.email)} className="text-brand-400 hover:text-red-500 transition-colors ml-0.5 flex-shrink-0" title="Remove">✕</button>
                </span>
              ))}
              {emailRecipients.length === 0 && <span className="text-xs text-red-400">No recipients — add an email below</span>}
            </div>
            <p className="text-xs text-faint mt-1">Auto-filled from the selected emails on linked contacts. Click ✕ to remove.</p>
          </div>

          {emailSuggestions.length > 0 && (
            <div>
              <label className="label">Suggestions From Linked Contacts</label>
              <div className="flex flex-wrap gap-2">
                {emailSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.email}
                    type="button"
                    onClick={() => addSuggestedRecipient(suggestion)}
                    className="rounded-full border border-base px-3 py-1 text-xs text-faint transition-colors hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {suggestion.label !== suggestion.email ? `${suggestion.label} - ${suggestion.email}` : suggestion.email}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add custom email */}
          <div>
            <label className="label">Add Another Recipient</label>
            <div className="flex gap-2">
              <input type="email" className="input-field flex-1" placeholder="any.email@domain.com" value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomEmail(); } }} />
              <button type="button" onClick={addCustomEmail} className="btn-secondary !px-3 shrink-0">+ Add</button>
            </div>
          </div>

          <div><label className="label">Subject *</label><input className="input-field" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} required /></div>

          {/* Template preview */}
          {reminderPreviewHtml ? (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30">
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Branded reminder template will be sent</p>
              </div>
              <iframe srcDoc={reminderPreviewHtml} className="w-full border-0" style={{ height: 280 }} title="Reminder Preview" />
            </div>
          ) : (
            <div><label className="label">Message *</label><textarea className="input-field" rows={6} value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} /></div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving || emailRecipients.length === 0}>
              <Send className="w-4 h-4" />{saving ? "Sending..." : `Send to ${emailRecipients.length} Recipient${emailRecipients.length !== 1 ? "s" : ""}`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEmailModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
