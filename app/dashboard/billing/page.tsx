"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useMotionValue, useMotionValueEvent, useSpring, useTransform } from "framer-motion";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import BillingSkeleton from "@/components/ui/BillingSkeleton";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { FINANCIAL_YEARS, formatCurrency, formatDate, PAYMENT_MODES, getPaymentPercentage } from "@/lib/utils";
import {
  Plus, Send, FileText, ChevronDown, ChevronUp, Trash2,
  CheckCircle2, AlertCircle,
  Wallet, Clock, ArrowLeftRight, Pencil, Download, BookOpen, CreditCard,
} from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";
import BillingTopControls from "./BillingTopControls";
import BillingSummaryStats from "./BillingSummaryStats";
import BillingSearchFilters from "./BillingSearchFilters";
import AdvancePaymentsSection from "./AdvancePaymentsSection";
// BillingStickyBar removed — stats now in normal flow between two sticky bars
import type {
  AdvanceClientRow,
  Billing,
  BillingFilter,
  BillingTab,
  Client,
  CreditTransaction,
  EmailOption,
  FinancialYearRecord,
  Payment,
  TargetBillingRow,
  ViewMode,
} from "./types";
import {
  CATEGORY_LABELS,
  PIBO_CATEGORIES,
  breakdownToTargetRows,
  buildLinkedContactEmailOptions,
  dateInputValue,
  isAppliedAdvancePayment,
  rateForTarget,
  restoreSuggestion,
  statusBorderStyle,
  targetEntriesFromRecord,
  targetRowsToBreakdown,
} from "./helpers";

// ── Interfaces ────────────────────────────────────────────────────────────────
// ── Constants ─────────────────────────────────────────────────────────────────
// ── Pure helpers ──────────────────────────────────────────────────────────────
// ── Status border accent ───────────────────────────────────────────────────────
// ── Main component ────────────────────────────────────────────────────────────
export default function BillingPage() {
  const [fy, setFy, financialYearLoaded] = useFinancialYearState();
  const { effectiveFinancialYear } = useFinancialYearPreference();

  // Modal visibility
  const [billingModal, setBillingModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [ledgerModal, setLedgerModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [applyAdvanceModal, setApplyAdvanceModal] = useState(false);

  // Modal data
  const [editingBilling, setEditingBilling] = useState<Billing | null>(null);
  const [ledgerClientId, setLedgerClientId] = useState("");
  const [invoiceBilling, setInvoiceBilling] = useState<Billing | null>(null);
  const [applyAdvanceBilling, setApplyAdvanceBilling] = useState<Billing | null>(null);
  const [activeBilling, setActiveBilling] = useState<Billing | null>(null);

  // UI state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedAdvanceClients, setExpandedAdvanceClients] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<BillingTab>("billing");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [topControlsHeight, setTopControlsHeight] = useState(100);
  const [headerMerged, setHeaderMerged] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirm modal
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; description?: string; note?: string;
    confirmLabel?: string; variant?: "danger" | "warning"; onConfirm: () => void | Promise<void>;
  }>({ open: false, title: "", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, open: false }));

  // Forms
  const [bForm, setBForm] = useState({ clientId: "", financialYear: effectiveFinancialYear, govtCharges: "0", consultancyCharges: "0", targetCharges: "0", otherCharges: "0", notes: "", dueDate: "" });
  const [pForm, setPForm] = useState({ clientId: "", financialYear: effectiveFinancialYear, paymentType: "billing" as "billing" | "advance", amountPaid: "", paymentDate: new Date().toISOString().split("T")[0], paymentMode: "NEFT", referenceNumber: "", notes: "" });
  const [emailForm, setEmailForm] = useState({ subject: "", message: "" });
  const [emailRecipients, setEmailRecipients] = useState<EmailOption[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<EmailOption[]>([]);
  const [emailSuggestionCatalog, setEmailSuggestionCatalog] = useState<EmailOption[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [reminderPreviewHtml, setReminderPreviewHtml] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", invoiceDate: "", invoiceAmount: "" });
  const [applyForm, setApplyForm] = useState({ clientId: "", financialYear: "", amountToApply: "", applyDate: new Date().toISOString().split("T")[0], notes: "" });

  // Target suggestion state
  const [targetRows, setTargetRows] = useState<TargetBillingRow[]>([]);
  const [targetSuggestionsLoading, setTargetSuggestionsLoading] = useState(false);
  const [targetSuggestionsError, setTargetSuggestionsError] = useState("");
  const [useTransactionRates, setUseTransactionRates] = useState(true);

  // Data
  const { data: billings, loading: bLoading, refetch: refetchBillings } = useCache<Billing[]>(`/api/billing?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: payments, refetch: refetchPayments } = useCache<Payment[]>(`/api/payments?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: clients } = useCache<Client[]>("/api/clients", { initialData: [] });
  const loading = !financialYearLoaded || bLoading;

  const clientName = useCallback((id: string) => clients.find((c) => c.clientId === id)?.companyName || id, [clients]);
  const clientPayments = (id: string) => payments.filter((p) => p.clientId === id && p.paymentType !== "advance");

  const advanceByClient = useMemo(() => {
    const map = new Map<string, number>();
    payments.filter((p) => p.paymentType === "advance")
      .forEach((p) => map.set(p.clientId, (map.get(p.clientId) || 0) + Number(p.amountPaid || 0)));
    return map;
  }, [payments]);

  const billingSummary = useMemo(() => {
    const totalBilled = billings.reduce((s, b) => s + Number(b.totalAmount || 0), 0);
    const totalCollected = billings.reduce((s, b) => s + Number(b.totalPaid || 0), 0);
    const totalPending = billings.reduce((s, b) => s + Number(b.pendingAmount || 0), 0);
    const totalAdvance = payments.filter((p) => p.paymentType === "advance").reduce((s, p) => s + Number(p.amountPaid || 0), 0);
    const invoiceGap = billings.filter((b) => !b.invoiceCreated).reduce((s, b) => s + Number(b.totalAmount || 0), 0);
    const paidCount = billings.filter((b) => b.pendingAmount <= 0 || b.paymentStatus.toLowerCase() === "paid").length;
    const partialCount = billings.filter((b) => b.pendingAmount > 0 && b.totalPaid > 0).length;
    const unpaidCount = billings.filter((b) => b.pendingAmount > 0 && b.totalPaid <= 0).length;
    const collectionPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
    const overdueCount = billings.filter((b) => (b.daysOverdue ?? 0) > 0).length;
    const aging = billings.reduce(
      (acc, b) => {
        const pending = Number(b.pendingAmount || 0);
        if (pending <= 0) return acc;
        const days = Number(b.daysOverdue || 0);
        if (days <= 0) acc.notDue += pending;
        else if (days <= 30) acc.days0To30 += pending;
        else if (days <= 60) acc.days31To60 += pending;
        else acc.days60Plus += pending;
        return acc;
      },
      { notDue: 0, days0To30: 0, days31To60: 0, days60Plus: 0 }
    );
    return { totalBilled, totalCollected, totalPending, totalAdvance, invoiceGap, paidCount, partialCount, unpaidCount, pendingCount: partialCount + unpaidCount, collectionPct, overdueCount, aging };
  }, [billings, payments]);

  const filteredBillings = useMemo(() => {
    const q = search.toLowerCase();
    return billings.filter((b) => {
      const name = clientName(b.clientId).toLowerCase();
      const matchesSearch = !search.trim() || name.includes(q) || b.clientId.toLowerCase().includes(q) || b.paymentStatus.toLowerCase().includes(q);
      const matchesFilter =
        statusFilter === "all" ||
        (statusFilter === "pending" && b.pendingAmount > 0) ||
        (statusFilter === "paid" && (b.pendingAmount <= 0 || b.paymentStatus.toLowerCase() === "paid")) ||
        (statusFilter === "partial" && b.pendingAmount > 0 && b.totalPaid > 0) ||
        (statusFilter === "unpaid" && b.pendingAmount > 0 && b.totalPaid <= 0) ||
        (statusFilter === "advance" && (advanceByClient.get(b.clientId) || 0) > 0) ||
        (statusFilter === "overdue" && (b.daysOverdue ?? 0) > 0) ||
        (statusFilter === "invoice-pending" && !b.invoiceCreated) ||
        (statusFilter === "invoice-created" && b.invoiceCreated === true);
      return matchesSearch && matchesFilter;
    });
  }, [advanceByClient, billings, search, statusFilter, clientName]);

  const advancePayments = useMemo(() => payments.filter((p) => p.paymentType === "advance"), [payments]);
  const appliedAdvancePayments = useMemo(() => payments.filter((p) => p.paymentType !== "advance" && isAppliedAdvancePayment(p)), [payments]);

  const advanceClientRows = useMemo<AdvanceClientRow[]>(() => {
    const ids = new Set<string>();
    advancePayments.forEach((p) => ids.add(p.clientId));
    appliedAdvancePayments.forEach((p) => ids.add(p.clientId));

    return Array.from(ids).map((clientId) => {
      const advances = advancePayments
        .filter((p) => p.clientId === clientId)
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      const appliedPayments = appliedAdvancePayments
        .filter((p) => p.clientId === clientId)
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      const pendingBillings = billings.filter((b) => b.clientId === clientId && b.pendingAmount > 0);
      const lastAdvanceDate = advances[0]?.paymentDate;

      return {
        clientId,
        clientName: clientName(clientId),
        available: advances.reduce((s, p) => s + Number(p.amountPaid || 0), 0),
        applied: appliedPayments.reduce((s, p) => s + Number(p.amountPaid || 0), 0),
        lastAdvanceDate,
        advances,
        appliedPayments,
        pendingBillings,
      };
    }).sort((a, b) => b.available - a.available || a.clientName.localeCompare(b.clientName));
  }, [advancePayments, appliedAdvancePayments, billings, clientName]);

  const filteredAdvanceClientRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return advanceClientRows;
    return advanceClientRows.filter((row) => {
      const paymentText = [...row.advances, ...row.appliedPayments]
        .some((p) => [p.paymentMode, p.referenceNumber, p.notes].some((v) => (v || "").toLowerCase().includes(q)));
      return row.clientName.toLowerCase().includes(q) || row.clientId.toLowerCase().includes(q) || paymentText;
    });
  }, [advanceClientRows, search]);

  // ── Modal openers ─────────────────────────────────────────────────────────
  const openBillingModal = () => {
    setEditingBilling(null); setTargetRows([]);
    setBForm({ clientId: "", financialYear: fy, govtCharges: "0", consultancyCharges: "0", targetCharges: "0", otherCharges: "0", notes: "", dueDate: "" });
    setBillingModal(true);
  };

  const openEditBillingModal = (billing: Billing) => {
    setEditingBilling(billing);
    setBForm({ clientId: billing.clientId, financialYear: billing.financialYear, govtCharges: String(billing.govtCharges ?? 0), consultancyCharges: String(billing.consultancyCharges ?? 0), targetCharges: String(billing.targetCharges ?? 0), otherCharges: String(billing.otherCharges ?? 0), notes: billing.notes || "", dueDate: dateInputValue(billing.dueDate) });
    setTargetRows(breakdownToTargetRows(billing.targetBreakdown));
    setTargetSuggestionsError("");
    setBillingModal(true);
  };

  const openLedgerModal = (clientId: string) => { setLedgerClientId(clientId); setLedgerModal(true); };

  const openPaymentModal = (billing: Billing) => {
    setPForm({ clientId: billing.clientId, financialYear: billing.financialYear, paymentType: "billing", amountPaid: "", paymentDate: new Date().toISOString().split("T")[0], paymentMode: "NEFT", referenceNumber: "", notes: "" });
    setPaymentModal(true);
  };

  const openAdvancePaymentModal = () => {
    setPForm({ clientId: "", financialYear: fy, paymentType: "advance", amountPaid: "", paymentDate: new Date().toISOString().split("T")[0], paymentMode: "NEFT", referenceNumber: "", notes: "" });
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
      const html = template.replace(/{{clientName}}/g, cName).replace(/{{financialYear}}/g, billing.financialYear).replace(/{{pendingAmount}}/g, fmt(billing.pendingAmount)).replace(/{{totalAmount}}/g, fmt(billing.totalAmount)).replace(/{{totalPaid}}/g, fmt(billing.totalPaid)).replace(/{{breakdownRows}}/g, breakdownRows);
      setReminderPreviewHtml(html);
    } catch { setReminderPreviewHtml(null); }
    setEmailModal(true);
  };

  const openInvoiceModal = (billing: Billing) => {
    setInvoiceBilling(billing);
    setInvoiceForm({ invoiceNumber: billing.invoiceNumber || "", invoiceDate: dateInputValue(billing.invoiceDate), invoiceAmount: billing.invoiceAmount != null ? String(billing.invoiceAmount) : "" });
    setInvoiceModal(true);
  };

  const openApplyAdvanceModal = (billing: Billing) => {
    const clientAdvance = advanceByClient.get(billing.clientId) || 0;
    const suggested = Math.min(clientAdvance, billing.pendingAmount);
    setApplyAdvanceBilling(billing);
    setApplyForm({ clientId: billing.clientId, financialYear: billing.financialYear, amountToApply: suggested > 0 ? suggested.toFixed(2) : "", applyDate: new Date().toISOString().split("T")[0], notes: "" });
    setApplyAdvanceModal(true);
  };

  // ── Email helpers ─────────────────────────────────────────────────────────
  const addCustomEmail = () => {
    const email = customEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Invalid email address"); return; }
    if (emailRecipients.find((r) => r.email === email)) { toast.error("Already added"); return; }
    setEmailRecipients([...emailRecipients, { label: email, email }]);
    setCustomEmail("");
  };

  const addSuggestedRecipient = (s: EmailOption) => {
    if (emailRecipients.find((e) => e.email === s.email)) return;
    setEmailRecipients((prev) => [...prev, s]);
    setEmailSuggestions((prev) => prev.filter((e) => e.email !== s.email));
  };

  const removeRecipient = (email: string) => {
    setEmailRecipients((prev) => prev.filter((e) => e.email !== email));
    setEmailSuggestions((prev) => restoreSuggestion(email, prev, emailSuggestionCatalog));
  };

  // ── Submit handlers ───────────────────────────────────────────────────────
  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const targetBreakdown = targetRowsToBreakdown(targetRows);
      const breakdownTotal = targetBreakdown.reduce((s, r) => s + r.totalAmount, 0);
      const shouldSave = (isPiboBillingClient || Boolean(editingBilling)) && targetBreakdown.length > 0 && Math.abs(Number(bForm.targetCharges || 0) - breakdownTotal) < 0.01;
      const r = await fetch(editingBilling ? `/api/billing/${editingBilling._id}` : "/api/billing", {
        method: editingBilling ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bForm, govtCharges: Number(bForm.govtCharges), consultancyCharges: Number(bForm.consultancyCharges), targetCharges: Number(bForm.targetCharges), otherCharges: Number(bForm.otherCharges), targetBreakdown: shouldSave ? targetBreakdown : [], dueDate: bForm.dueDate || null }),
      });
      if (!r.ok) { toast.error("Error saving billing"); return; }
      toast.success(editingBilling ? "Billing updated!" : "Billing saved!");
      setEditingBilling(null); setBillingModal(false);
      invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments();
    } finally { setSaving(false); }
  };

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pForm, amountPaid: Number(pForm.amountPaid) }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(typeof d.error === "string" ? d.error : "Error saving payment"); return; }
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
      const results = await Promise.all(emailRecipients.map((r) => fetch("/api/email/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: r.email, subject: emailForm.subject, ...(reminderPreviewHtml ? { reminderHtml: reminderPreviewHtml } : { message: emailForm.message }), logType: "payment_reminder", logClientId: activeBilling?.clientId || "", logClientName: client?.companyName || activeBilling?.clientId || "", logFy: activeBilling?.financialYear || "" }) }).then((res) => res.json())));
      const failed = results.filter((d) => !d.success);
      if (failed.length > 0) toast.error(`${failed.length} email(s) failed`);
      else { toast.success(`Reminder sent to ${emailRecipients.length} recipient${emailRecipients.length !== 1 ? "s" : ""}!`); setEmailModal(false); }
    } finally { setSaving(false); }
  };

  const saveApplyAdvance = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch("/api/payments/apply-advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...applyForm, amountToApply: Number(applyForm.amountToApply) }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(typeof d.error === "string" ? d.error : "Failed to apply advance"); return; }
      toast.success("Advance applied to billing!");
      setApplyAdvanceModal(false);
      invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments();
    } finally { setSaving(false); }
  };

  const saveInvoiceStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceBilling) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/billing/${invoiceBilling._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceCreated: true, invoiceNumber: invoiceForm.invoiceNumber, invoiceDate: invoiceForm.invoiceDate || null, invoiceAmount: invoiceForm.invoiceAmount !== "" ? Number(invoiceForm.invoiceAmount) : null }) });
      if (!r.ok) { toast.error("Failed to update invoice status"); return; }
      toast.success("Invoice marked as created");
      setInvoiceModal(false);
      invalidate("/api/billing"); refetchBillings();
    } finally { setSaving(false); }
  };

  const markInvoiceNotCreated = async (billing: Billing) => {
    const r = await fetch(`/api/billing/${billing._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceCreated: false, invoiceNumber: "", invoiceDate: null, invoiceAmount: null }) });
    if (r.ok) { toast.success("Invoice marked as not created"); invalidate("/api/billing"); refetchBillings(); }
    else toast.error("Failed to update invoice status");
  };

  const deleteBilling = (id: string, clientId: string) => {
    setConfirmState({
      open: true, title: "Delete billing record?",
      description: `This will permanently remove the billing record for ${clientName(clientId)}.`,
      note: "Payment records linked to this client will not be deleted.",
      confirmLabel: "Delete billing", variant: "danger",
      onConfirm: async () => {
        const r = await fetch(`/api/billing/${id}`, { method: "DELETE" });
        if (r.ok) { toast.success("Billing deleted"); invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments(); closeConfirm(); }
        else toast.error("Failed to delete");
      },
    });
  };

  const deletePayment = (id: string) => {
    setConfirmState({
      open: true, title: "Delete payment record?",
      description: "This payment entry will be permanently removed and the billing balance will be recalculated.",
      confirmLabel: "Delete payment", variant: "danger",
      onConfirm: async () => {
        const r = await fetch(`/api/payments/${id}`, { method: "DELETE" });
        if (r.ok) { toast.success("Payment deleted"); invalidate("/api/billing", "/api/payments", "/api/dashboard"); refetchBillings(); refetchPayments(); closeConfirm(); }
        else toast.error("Failed to delete");
      },
    });
  };

  const toggleRow = (id: string) => {
    const s = new Set(expandedRows);
    if (s.has(id)) s.delete(id); else s.add(id);
    setExpandedRows(s);
  };

  const toggleAdvanceClient = (clientId: string) => {
    const s = new Set(expandedAdvanceClients);
    if (s.has(clientId)) s.delete(clientId); else s.add(clientId);
    setExpandedAdvanceClients(s);
  };

  const exportBillingCsv = () => {
    const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = filteredBillings.map((b) => [b.clientId, clientName(b.clientId), b.financialYear, b.govtCharges, b.consultancyCharges, b.targetCharges, b.otherCharges, b.totalAmount, b.totalPaid, b.pendingAmount, b.paymentStatus, b.dueDate ? formatDate(b.dueDate) : "", b.daysOverdue || 0, advanceByClient.get(b.clientId) || 0, b.invoiceCreated ? "Yes" : "No", b.invoiceNumber || "", b.notes || ""]);
    const csv = [["Client ID", "Client", "FY", "Govt", "Consultancy", "Target", "Other", "Total", "Paid", "Pending", "Status", "Due Date", "Days Overdue", "Advance Balance", "Invoice Created", "Invoice No.", "Notes"], ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `billing-payments-${fy}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  // ── Derived UI values ─────────────────────────────────────────────────────
  const bFormTotal = Number(bForm.govtCharges) + Number(bForm.consultancyCharges) + Number(bForm.targetCharges) + Number(bForm.otherCharges);
  const isAdvancePayment = pForm.paymentType === "advance";
  const selectedPaymentClient = clients.find((c) => c.clientId === pForm.clientId);
  const selectedBillingClient = clients.find((c) => c.clientId === bForm.clientId);
  const isPiboBillingClient = Boolean(selectedBillingClient && PIBO_CATEGORIES.has(selectedBillingClient.category));
  const targetRowsTotal = useMemo(() => targetRows.reduce((s, r) => { if (!r.include) return s; const taxable = Number(r.quantity || 0) * Number(r.rate || 0); const gst = taxable * (Number(r.gstPercent || 0) / 100); return s + taxable + gst; }, 0), [targetRows]);
  const advanceClientCount = advanceClientRows.filter((row) => row.available > 0).length;
  const billingAdvanceRecordCount = billings.filter((b) => (advanceByClient.get(b.clientId) || 0) > 0).length;
  const appliedAdvanceTotal = appliedAdvancePayments.reduce((s, p) => s + Number(p.amountPaid || 0), 0);

  const filterOptions: Array<{ value: BillingFilter; label: string; count: number; separator?: boolean }> = [
    { value: "all", label: "All", count: billings.length },
    { value: "pending", label: "Pending", count: billingSummary.pendingCount },
    { value: "partial", label: "Partial", count: billingSummary.partialCount },
    { value: "unpaid", label: "Unpaid", count: billingSummary.unpaidCount },
    { value: "paid", label: "Paid", count: billingSummary.paidCount },
    { value: "advance", label: "Has Advance", count: billingAdvanceRecordCount },
    { value: "overdue", label: "Overdue", count: billingSummary.overdueCount },
    { value: "invoice-pending", label: "Invoice Pending", count: billings.filter((b) => !b.invoiceCreated).length, separator: true },
    { value: "invoice-created", label: "Invoice Created", count: billings.filter((b) => b.invoiceCreated === true).length },
  ];

  // ── Target suggestions loader ──────────────────────────────────────────────
  useEffect(() => {
    if (editingBilling) return;
    if (!billingModal || !bForm.clientId || !bForm.financialYear || !isPiboBillingClient) { setTargetRows([]); setTargetSuggestionsError(""); return; }
    let cancelled = false;
    (async () => {
      setTargetSuggestionsLoading(true); setTargetSuggestionsError("");
      try {
        const [fyRes, txRes] = await Promise.all([
          fetch(`/api/financial-year?clientId=${encodeURIComponent(bForm.clientId)}&fy=${encodeURIComponent(bForm.financialYear)}`, { cache: "no-store" }),
          fetch(`/api/credit-transactions?toClientId=${encodeURIComponent(bForm.clientId)}&fy=${encodeURIComponent(bForm.financialYear)}`, { cache: "no-store" }),
        ]);
        const fyBody = await fyRes.json().catch(() => null);
        const txBody = await txRes.json().catch(() => null);
        if (!fyRes.ok) throw new Error(fyBody?.error || "Failed to load target data");
        if (!txRes.ok) throw new Error(txBody?.error || "Failed to load transaction rates");
        if (cancelled) return;
        const record = Array.isArray(fyBody) ? fyBody[0] as FinancialYearRecord | undefined : null;
        const targets = targetEntriesFromRecord(record);
        const transactions = Array.isArray(txBody) ? txBody as CreditTransaction[] : [];
        setTargetRows(targets.map((t) => {
          const txRate = useTransactionRates ? rateForTarget(transactions, t) : 0;
          return { key: `${t.categoryId}-${t.type}`, categoryId: t.categoryId, type: t.type, quantity: String(t.value), rate: txRate > 0 ? String(txRate) : "", gstPercent: "18", include: true, rateSource: txRate > 0 ? "transaction" : "manual" };
        }));
      } catch (err) {
        if (cancelled) return;
        setTargetRows([]); setTargetSuggestionsError(err instanceof Error ? err.message : "Failed to load target suggestions");
      } finally { if (!cancelled) setTargetSuggestionsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [billingModal, bForm.clientId, bForm.financialYear, isPiboBillingClient, useTransactionRates, editingBilling]);

  // ── Two-phase scroll architecture ───────────────────────────────────────
  //
  // PHASE 1 (synthetic progress 0→1):
  //   The real scroll container is LOCKED at scrollTop=0.
  //   Wheel / touch delta is accumulated into a synthetic MotionValue that
  //   drives the header collapse animation.  The billing list does not move
  //   at all — it stays flush below the search bar the whole time.
  //
  // PHASE 2 (real scroll, progress=1):
  //   Once the header has fully merged the scroll lock is released and the
  //   container scrolls normally, with billing cards going under the compact
  //   merged header just like any other page.
  //
  const headerMergeScroll = 240;  // synthetic px needed to complete Phase 1
  const syntheticY = useMotionValue(0);        // 0 → headerMergeScroll
  const [statsContentHeight, setStatsContentHeight] = useState(0);

  useEffect(() => {
    const el = document.getElementById("dashboard-scroll-area") as HTMLElement | null;
    if (!el) return;

    // Only run Phase-1 lock when on the billing tab
    if (activeTab !== "billing") {
      el.style.overflow = "";
      return;
    }

    // Reset synthetic progress and container scroll when tab is entered
    syntheticY.set(0);
    el.scrollTop = 0;

    let accumulated = 0;

    const unlock = () => {
      accumulated = headerMergeScroll;
      el.style.overflow = "";
    };

    const relock = () => {
      // Re-enter Phase 1: lock overflow and start animating back from full
      accumulated = headerMergeScroll;
      el.style.overflow = "hidden";
    };

    const onWheel = (e: WheelEvent) => {
      const isLocked = el.style.overflow === "hidden";

      if (!isLocked) {
        // Phase 2 (native scroll). If the user scrolls up while at the very
        // top of the list, re-lock and hand control back to Phase 1 so the
        // header can expand again.
        if (e.deltaY < 0 && el.scrollTop === 0) {
          relock();
          e.preventDefault();
          accumulated = Math.max(0, accumulated + e.deltaY);
          syntheticY.set(accumulated);
        }
        return;
      }

      e.preventDefault();

      accumulated = Math.min(headerMergeScroll, Math.max(0, accumulated + e.deltaY));
      syntheticY.set(accumulated);

      if (accumulated >= headerMergeScroll) {
        unlock();
      }
    };

    // Touch support
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const isLocked = el.style.overflow === "hidden";
      const delta = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;

      if (!isLocked) {
        // Re-lock on upward swipe at top of list
        if (delta < 0 && el.scrollTop === 0) {
          relock();
          e.preventDefault();
          accumulated = Math.max(0, accumulated + delta);
          syntheticY.set(accumulated);
        }
        return;
      }

      e.preventDefault();

      accumulated = Math.min(headerMergeScroll, Math.max(0, accumulated + delta));
      syntheticY.set(accumulated);

      if (accumulated >= headerMergeScroll) {
        unlock();
      }
    };

    // Lock Phase 1
    el.style.overflow = "hidden";

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.style.overflow = "";
    };
  // syntheticY is a stable MotionValue ref, safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const rawScrollProgress = useTransform(syntheticY, [0, headerMergeScroll], [0, 1], { clamp: true });

  const scrollProgress = useSpring(rawScrollProgress, {
    stiffness: 300,
    damping: 32,
    mass: 0.5,
    restDelta: 0.001,
  });

  // searchBarStickyTop: tracks the exact bottom of the (collapsing) stats
  // section so the search bar is always glued to it during Phase 1.
  const statsAnimatedHeight = useTransform(
    scrollProgress,
    [0, 1],
    [statsContentHeight + 12, 0],
  );
  const searchBarStickyTop = useTransform(
    statsAnimatedHeight,
    (v) => topControlsHeight + v,
  );

  useMotionValueEvent(syntheticY, "change", (latest) => {
    const next = latest >= headerMergeScroll;
    setHeaderMerged((current) => (current === next ? current : next));
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Billing & Payments" description="Manage invoices and payment collection">
        <div className="glass-tray">
          <button className="glass-pill" onClick={exportBillingCsv} disabled={filteredBillings.length === 0}><Download className="w-3.5 h-3.5" /> Export CSV</button>
          <button className="glass-pill" onClick={openAdvancePaymentModal}><Plus className="w-3.5 h-3.5" /> Record Advance</button>
          <button className="glass-pill glass-pill-active" onClick={openBillingModal}><Plus className="w-3.5 h-3.5" /> Add Billing</button>
        </div>
      </PageHeader>

      {/* ── 1. FY controls / Tabs — sticky at top:0 ──────────────────────── */}
      <BillingTopControls
        fy={fy}
        onFyChange={setFy}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        billingCount={billings.length}
        advanceCount={advanceClientRows.length}
        onHeightChange={setTopControlsHeight}
        merged={headerMerged && activeTab === "billing"}
      />

      {activeTab === "billing" && (
        <>
          {/* ── 2. Stats cards — normal flow, OWN card, scroll-animated ───── */}
          {/*    Visually sits freely between FY bar and search bar.           */}
          {/*    Collapses via maxHeight as user scrolls (0→240px range).      */}
          <BillingSummaryStats
            billingSummary={billingSummary}
            billings={billings}
            advanceClientCount={advanceClientCount}
            scrollProgress={scrollProgress}
            onContentHeightChange={setStatsContentHeight}
          />

          {/* ── 3. Search + filters — sticky below FY bar (~88px from top) ── */}
          {/*    stickyTop ≈ FY row (42px) + tab row (46px) + gap = ~88px      */}
          <BillingSearchFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            filterOptions={filterOptions}
            merged={headerMerged}
            stickyTop={topControlsHeight}
            stickyTopOffset={searchBarStickyTop}
          />
         
        </>
      )}

      {activeTab === "billing" && (
        <>
      {/* ── Billing list ─────────────────────────────────────────────────── */}
      {loading ? <BillingSkeleton /> : billings.length === 0 ? (
        <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
          <EmptyState message="No billing records for this FY" description="Add billing for a client to get started" />
        </div>
      ) : filteredBillings.length === 0 ? (
        <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
          <EmptyState message="No matching billing records" description="Try a different search or filter" />
        </div>
      ) : viewMode === "table" ? (
        /* ── TABLE VIEW ─────────────────────────────────────────────────── */
        <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
          <TableWrapper>
            <table className="w-full min-w-[1180px] table-fixed">
              <colgroup>
                <col className="w-[25%]" />
                <col className="w-[10%]" />
                <col className="w-[7%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="table-header">Client</th>
                  <th className="table-header !text-right">Total Billed</th>
                  <th className="table-header !text-right">Paid</th>
                  <th className="table-header !text-right">Pending</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Invoice</th>
                  <th className="table-header">Due / Overdue</th>
                  <th className="table-header !text-right">Advance</th>
                  <th className="table-header !text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBillings.map((billing) => {
                  const advance = advanceByClient.get(billing.clientId) || 0;
                  const isOverdue = (billing.daysOverdue ?? 0) > 0;
                  const isPaid = billing.pendingAmount <= 0 || billing.paymentStatus.toLowerCase() === "paid";
                  const isPartial = billing.pendingAmount > 0 && billing.totalPaid > 0;
                  return (
                    <tr key={billing._id} className="hover:bg-surface border-l-2 transition-colors" style={{ borderLeftColor: isPaid ? "#34d399" : isOverdue ? "#f87171" : isPartial ? "#fbbf24" : "#f87171" }}>
                      <td className="table-cell">
                        <p className="font-medium text-default truncate" title={clientName(billing.clientId)}>{clientName(billing.clientId)}</p>
                        <p className="text-xs text-faint">{billing.clientId} · FY {billing.financialYear}</p>
                      </td>
                      <td className="table-cell text-right font-semibold text-default">{formatCurrency(billing.totalAmount)}</td>
                      <td className="table-cell text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(billing.totalPaid)}</td>
                      <td className="table-cell text-right">
                        {billing.pendingAmount > 0
                          ? <span className="font-bold text-red-500 dark:text-red-400">{formatCurrency(billing.pendingAmount)}</span>
                          : <span className="text-faint">—</span>}
                      </td>
                      <td className="table-cell whitespace-nowrap"><PaymentStatusBadge status={billing.paymentStatus} /></td>
                      <td className="table-cell whitespace-nowrap">
                        {billing.invoiceCreated ? (
                          <button type="button" onClick={() => markInvoiceNotCreated(billing)} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-3 h-3" />
                            {billing.invoiceNumber ? billing.invoiceNumber : "Created"}
                          </button>
                        ) : (
                          <button type="button" onClick={() => openInvoiceModal(billing)} className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/25 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 transition-colors">
                            <AlertCircle className="w-3 h-3" /> Pending
                          </button>
                        )}
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        {billing.dueDate && billing.pendingAmount > 0 ? (
                          isOverdue
                            ? <span className="text-xs text-red-500 font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{billing.daysOverdue}d overdue</span>
                            : <span className="text-xs text-faint">Due {formatDate(billing.dueDate)}</span>
                        ) : <span className="text-faint text-xs">—</span>}
                      </td>
                      <td className="table-cell text-right whitespace-nowrap">
                        {advance > 0 ? (
                          <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Wallet className="w-3 h-3" /> {formatCurrency(advance)}
                          </span>
                        ) : <span className="text-faint text-xs">-</span>}
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openPaymentModal(billing)} className="p-1 text-faint hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Add payment"><CreditCard className="w-3.5 h-3.5" /></button>
                          {advance > 0 && billing.pendingAmount > 0 && (
                            <button onClick={() => openApplyAdvanceModal(billing)} className="p-1 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Apply advance"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => openLedgerModal(billing.clientId)} className="p-1 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Ledger"><BookOpen className="w-3.5 h-3.5" /></button>
                          <button onClick={() => openEditBillingModal(billing)} className="p-1 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteBilling(billing._id, billing.clientId)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
          <div className="px-4 py-2.5 border-t border-soft flex items-center justify-between text-xs text-faint">
            <span>Showing {filteredBillings.length} of {billings.length} records</span>
            <span className="font-medium text-default">{formatCurrency(filteredBillings.reduce((s, b) => s + b.totalAmount, 0))} total billed</span>
          </div>
        </div>
      ) : (
        /* ── CARD VIEW ──────────────────────────────────────────────────── */
        <div className="space-y-3">
          {filteredBillings.map((billing) => {
            const expanded = expandedRows.has(billing._id);
            const cPayments = clientPayments(billing.clientId);
            const pct = getPaymentPercentage(billing.totalPaid, billing.totalAmount);
            const targetBreakdown = billing.targetBreakdown || [];
            const hasTargetBreakdown = targetBreakdown.length > 0;
            const targetBreakdownTotal = targetBreakdown.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
            const advance = advanceByClient.get(billing.clientId) || 0;
            const isPaid = billing.pendingAmount <= 0 || billing.paymentStatus.toLowerCase() === "paid";
            const isOverdue = (billing.daysOverdue ?? 0) > 0;

            return (
              <div key={billing._id} className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden" style={statusBorderStyle(billing)}>
                <div className="p-5">
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-default">{clientName(billing.clientId)}</h3>
                      <p className="text-xs text-faint mt-0.5">{billing.clientId} · FY {billing.financialYear}</p>
                      {billing.dueDate && billing.pendingAmount > 0 && (
                        <p className="text-xs mt-0.5">
                          {isOverdue ? (
                            <span className="text-red-500 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3 inline" />{billing.daysOverdue}d overdue
                            </span>
                          ) : (
                            <span className="text-faint">Due {formatDate(billing.dueDate)}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/25 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                          <Clock className="w-2.5 h-2.5" /> Overdue
                        </span>
                      )}
                      <PaymentStatusBadge status={billing.paymentStatus} />
                      {billing.invoiceCreated ? (
                        <button type="button" onClick={() => markInvoiceNotCreated(billing)} title="Invoice created — click to revert" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                          <CheckCircle2 className="w-3 h-3" /> Invoice Created
                        </button>
                      ) : (
                        <button type="button" onClick={() => openInvoiceModal(billing)} title="Invoice not yet created — click to mark" className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/25 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors">
                          <AlertCircle className="w-3 h-3" /> Invoice Pending
                        </button>
                      )}
                      <button onClick={() => openEditBillingModal(billing)} className="p-1.5 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit billing"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteBilling(billing._id, billing.clientId)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete billing"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Notes */}
                  {billing.notes && (
                    <div className="mb-4 rounded-lg border border-base bg-surface px-3 py-2">
                      <p className="text-xs font-medium text-faint">Billing note</p>
                      <p className="mt-0.5 text-sm text-muted">{billing.notes}</p>
                    </div>
                  )}

                  {/* Invoice info strip */}
                  {billing.invoiceCreated && (billing.invoiceNumber || billing.invoiceDate || billing.invoiceAmount != null) && (
                    <div className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 flex flex-wrap items-center gap-4">
                      {billing.invoiceNumber && <div><p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Invoice No.</p><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{billing.invoiceNumber}</p></div>}
                      {billing.invoiceDate && <div><p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Date</p><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{formatDate(billing.invoiceDate)}</p></div>}
                      {billing.invoiceAmount != null && <div><p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Amount</p><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{formatCurrency(billing.invoiceAmount)}</p></div>}
                      <button type="button" onClick={() => openInvoiceModal(billing)} className="text-xs text-emerald-600 dark:text-emerald-400 underline underline-offset-2 ml-auto">Edit</button>
                    </div>
                  )}

                  {/* Charge breakdown — compact horizontal */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    {[
                      { label: "Govt", value: billing.govtCharges },
                      { label: "Consultancy", value: billing.consultancyCharges },
                      { label: "Target", value: billing.targetCharges, extra: hasTargetBreakdown },
                      { label: "Other", value: billing.otherCharges },
                    ].map((item) => (
                      <div key={item.label} className="bg-surface rounded-lg px-3 py-2">
                        <p className="text-[11px] text-muted">{item.label}</p>
                        <p className="font-semibold text-sm text-default">{formatCurrency(item.value)}</p>
                        {item.extra && (
                          <button type="button" onClick={() => toggleRow(billing._id)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-300">
                            GST incl. {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Progress bar with prominent pending amount */}
                  <div className="mb-4">
                    <div className="flex justify-between items-baseline text-xs mb-1.5">
                      <span className="text-muted">{Math.round(pct)}% collected</span>
                      {billing.pendingAmount > 0 && (
                        <span className="text-sm font-bold text-red-500 dark:text-red-400">{formatCurrency(billing.pendingAmount)} pending</span>
                      )}
                      {billing.pendingAmount <= 0 && (
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Fully paid</span>
                      )}
                    </div>
                    <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all ${isPaid ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-faint mt-1">
                      <span>Paid: {formatCurrency(billing.totalPaid)}</span>
                      <span>Total: {formatCurrency(billing.totalAmount)}</span>
                    </div>
                    {/* Advance balance indicator if available */}
                    {advance > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <Wallet className="w-3 h-3" /> {formatCurrency(advance)} advance available
                      </p>
                    )}
                  </div>

                  {/* Action tray */}
                  <div className="glass-tray" style={{ flexWrap: "wrap" }}>
                    <button className="glass-pill glass-pill-active" onClick={() => openPaymentModal(billing)}><Plus className="w-3.5 h-3.5" /> Add Payment</button>
                    {advance > 0 && billing.pendingAmount > 0 && (
                      <button className="glass-pill" style={{ color: "var(--color-amber-600, #d97706)" }} onClick={() => openApplyAdvanceModal(billing)} title={`₹${advance.toLocaleString("en-IN")} available`}>
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Apply Advance
                      </button>
                    )}
                    <button className="glass-pill" onClick={() => openLedgerModal(billing.clientId)}><BookOpen className="w-3.5 h-3.5" /> Ledger</button>
                    <button className="glass-pill" onClick={() => openEmailModal(billing)}><Send className="w-3.5 h-3.5" /> Send Reminder</button>
                    <button className="glass-pill" onClick={() => toggleRow(billing._id)}>
                      <FileText className="w-3.5 h-3.5" /> {hasTargetBreakdown ? "Details" : "Payments"} {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div className="border-t border-soft bg-surface/30">
                    {hasTargetBreakdown && (
                      <div className="p-4 border-b border-soft">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                          <div>
                            <p className="text-sm font-semibold text-default">Target Breakdown</p>
                            <p className="text-xs text-faint">Quantity, rate, GST, and final amount.</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-xs text-faint">Breakdown total</p>
                            <p className="text-sm font-bold text-default">{formatCurrency(targetBreakdownTotal)}</p>
                          </div>
                        </div>
                        <TableWrapper><table className="w-full min-w-[720px]">
                          <thead><tr>
                            <th className="table-header">Category</th>
                            <th className="table-header">Type</th>
                            <th className="table-header">Target</th>
                            <th className="table-header">Rate</th>
                            <th className="table-header">Taxable</th>
                            <th className="table-header">GST</th>
                            <th className="table-header">Total</th>
                          </tr></thead>
                          <tbody>
                            {targetBreakdown.map((row, idx) => (
                              <tr key={`${billing._id}-${row.categoryId}-${row.type}-${idx}`} className="hover:bg-surface">
                                <td className="table-cell font-medium text-default">{row.categoryLabel}</td>
                                <td className="table-cell whitespace-nowrap">
                                  <span className="bg-surface text-muted text-xs px-2 py-0.5 rounded">{row.type === "EOL" ? "EOL" : "Recycling"}</span>
                                  {row.rateSource === "transaction" && <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400">rate from credits</span>}
                                </td>
                                <td className="table-cell whitespace-nowrap">{Number(row.quantity || 0).toLocaleString("en-IN")}</td>
                                <td className="table-cell whitespace-nowrap">{formatCurrency(row.rate)}</td>
                                <td className="table-cell whitespace-nowrap">{formatCurrency(row.taxableAmount)}</td>
                                <td className="table-cell whitespace-nowrap">{Number(row.gstPercent || 0)}% — {formatCurrency(row.gstAmount)}</td>
                                <td className="table-cell whitespace-nowrap font-semibold text-default">{formatCurrency(row.totalAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table></TableWrapper>
                      </div>
                    )}
                    {hasTargetBreakdown && (
                      <div className="px-4 pt-4">
                        <p className="text-sm font-semibold text-default mb-0.5">Payment History</p>
                        <p className="text-xs text-faint mb-3">Payments recorded against this billing.</p>
                      </div>
                    )}
                    {cPayments.length === 0 ? (
                      <p className="text-center text-sm text-faint py-6">No payments recorded yet</p>
                    ) : (
                      <TableWrapper><table className="w-full min-w-[720px]">
                        <thead><tr>
                          <th className="table-header">Date</th>
                          <th className="table-header">Amount</th>
                          <th className="table-header">Source</th>
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
                              <td className="table-cell whitespace-nowrap">
                                {isAppliedAdvancePayment(p)
                                  ? <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300 text-xs px-2 py-0.5 border border-amber-200 dark:border-amber-800">Applied advance</span>
                                  : <span className="rounded-full bg-surface text-muted text-xs px-2 py-0.5 border border-base">Direct</span>}
                              </td>
                              <td className="table-cell whitespace-nowrap"><span className="bg-surface text-muted text-xs px-2 py-0.5 rounded">{p.paymentMode}</span></td>
                              <td className="table-cell text-faint">{p.referenceNumber || "—"}</td>
                              <td className="table-cell text-faint text-xs">{p.notes || "—"}</td>
                              <td className="table-cell whitespace-nowrap">
                                {isAppliedAdvancePayment(p)
                                  ? <span className="text-[11px] text-faint">Locked</span>
                                  : <button onClick={() => deletePayment(p._id)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete payment"><Trash2 className="w-3.5 h-3.5" /></button>}
                              </td>
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

      {/* ────────────────────── MODALS ────────────────────────────────────── */}

        </>
      )}

      {activeTab === "advances" && (
        <AdvancePaymentsSection
          fy={fy}
          billingSummary={billingSummary}
          appliedAdvanceTotal={appliedAdvanceTotal}
          advanceClientRows={advanceClientRows}
          filteredAdvanceClientRows={filteredAdvanceClientRows}
          expandedAdvanceClients={expandedAdvanceClients}
          search={search}
          onSearchChange={setSearch}
          onRecordAdvance={openAdvancePaymentModal}
          onApplyAdvance={openApplyAdvanceModal}
          onOpenLedger={openLedgerModal}
          onToggleClient={toggleAdvanceClient}
          onDeletePayment={deletePayment}
        />
      )}
      {/* Add / Edit Billing Modal */}
      <Modal open={billingModal} onClose={() => { setBillingModal(false); setEditingBilling(null); }} title={editingBilling ? "Edit Billing" : "Add / Update Billing"}>
        <form onSubmit={saveBilling} className="space-y-4">
          <div>
            <label className="label">Client *</label>
            <select className="input-field" value={bForm.clientId} onChange={(e) => setBForm({ ...bForm, clientId: e.target.value })} required disabled={Boolean(editingBilling)}>
              <option value="">Select Client</option>
              {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName}</option>)}
            </select>
            {editingBilling && <p className="text-xs text-faint mt-1">Client cannot be changed while editing.</p>}
          </div>
          <div>
            <label className="label">Financial Year *</label>
            <select className="input-field" value={bForm.financialYear} onChange={(e) => setBForm({ ...bForm, financialYear: e.target.value })} required disabled={Boolean(editingBilling)}>
              {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {editingBilling && <p className="text-xs text-faint mt-1">Financial year is locked to prevent duplicate records.</p>}
          </div>

          {/* PIBO Target suggestions */}
          {bForm.clientId && (
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
                <p className="text-sm text-muted">Loading target suggestions…</p>
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
                    <button type="button" className="btn-secondary" onClick={() => setBForm((f) => ({ ...f, targetCharges: targetRowsTotal.toFixed(2) }))} disabled={targetRowsTotal <= 0}>
                      Apply to Target Charges
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Govt Charges</label><input type="number" className="input-field" value={bForm.govtCharges} onChange={(e) => setBForm({ ...bForm, govtCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Consultancy Charges</label><input type="number" className="input-field" value={bForm.consultancyCharges} onChange={(e) => setBForm({ ...bForm, consultancyCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Target Charges</label><input type="number" className="input-field" value={bForm.targetCharges} onChange={(e) => setBForm({ ...bForm, targetCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Other Charges</label><input type="number" className="input-field" value={bForm.otherCharges} onChange={(e) => setBForm({ ...bForm, otherCharges: e.target.value })} min="0" step="0.01" /></div>
          </div>
          {bFormTotal > 0 && (
            <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 text-center border border-brand-100 dark:border-brand-800">
              <p className="text-xs text-muted">Total Amount</p>
              <p className="text-xl font-bold text-brand-700 dark:text-brand-400">{formatCurrency(bFormTotal)}</p>
            </div>
          )}
          <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={bForm.notes} onChange={(e) => setBForm({ ...bForm, notes: e.target.value })} /></div>
          <div>
            <label className="label">Due Date <span className="text-faint font-normal">(optional)</span></label>
            <input type="date" className="input-field" value={bForm.dueDate} onChange={(e) => setBForm({ ...bForm, dueDate: e.target.value })} />
            <p className="text-xs text-faint mt-1">Set a deadline to track overdue status.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving…" : editingBilling ? "Update Billing" : "Save Billing"}</button>
            <button type="button" className="btn-secondary" onClick={() => { setBillingModal(false); setEditingBilling(null); }}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Add Payment Modal */}
      <Modal open={paymentModal} onClose={() => setPaymentModal(false)} title={isAdvancePayment ? "Record Advance Payment" : "Add Payment"}>
        <form onSubmit={savePayment} className="space-y-4">
          <div>
            <label className="label">Payment Type *</label>
            <select className="input-field" value={pForm.paymentType} onChange={(e) => setPForm((f) => ({ ...f, paymentType: e.target.value === "advance" ? "advance" : "billing" }))}>
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
                <select className="input-field" value={pForm.clientId} onChange={(e) => setPForm({ ...pForm, clientId: e.target.value })} required>
                  <option value="">Select Client</option>
                  {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Financial Year *</label>
                <select className="input-field" value={pForm.financialYear} onChange={(e) => setPForm({ ...pForm, financialYear: e.target.value })} required>
                  {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Client</label>
                <div className="input-field bg-surface text-muted flex items-center">{selectedPaymentClient?.companyName || pForm.clientId || "—"}</div>
              </div>
              <div>
                <label className="label">Financial Year</label>
                <div className="input-field bg-surface text-muted flex items-center">{pForm.financialYear || effectiveFinancialYear}</div>
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
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving…" : isAdvancePayment ? "Record Advance" : "Record Payment"}</button>
            <button type="button" className="btn-secondary" onClick={() => setPaymentModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Email / Reminder Modal */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="Send Payment Reminder" size="lg">
        <form onSubmit={sendEmail} className="space-y-4">
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
            <p className="text-xs text-faint mt-1">Auto-filled from linked contacts. Click ✕ to remove.</p>
          </div>
          {emailSuggestions.length > 0 && (
            <div>
              <label className="label">Suggestions</label>
              <div className="flex flex-wrap gap-2">
                {emailSuggestions.map((s) => (
                  <button key={s.email} type="button" onClick={() => addSuggestedRecipient(s)} className="rounded-full border border-base px-3 py-1 text-xs text-faint transition-colors hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300">
                    {s.label !== s.email ? `${s.label} — ${s.email}` : s.email}
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
          <div><label className="label">Subject *</label><input className="input-field" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} required /></div>
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
              <Send className="w-4 h-4" />{saving ? "Sending…" : `Send to ${emailRecipients.length} Recipient${emailRecipients.length !== 1 ? "s" : ""}`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEmailModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Client Ledger Modal */}
      <Modal open={ledgerModal} onClose={() => setLedgerModal(false)} title="Client Ledger" size="lg">
        {ledgerClientId && (() => {
          const lb = billings.filter((b) => b.clientId === ledgerClientId);
          const lp = payments.filter((p) => p.clientId === ledgerClientId);
          const directPay = lp.filter((p) => p.paymentType !== "advance" && !isAppliedAdvancePayment(p));
          const appliedAdv = lp.filter((p) => p.paymentType !== "advance" && isAppliedAdvancePayment(p));
          const advBalance = advanceByClient.get(ledgerClientId) || 0;
          const totalBilled = lb.reduce((s, b) => s + Number(b.totalAmount || 0), 0);
          const totalDirect = directPay.reduce((s, p) => s + Number(p.amountPaid || 0), 0);
          const totalApplied = appliedAdv.reduce((s, p) => s + Number(p.amountPaid || 0), 0);
          const pending = lb.reduce((s, b) => s + Number(b.pendingAmount || 0), 0);
          return (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-default">{clientName(ledgerClientId)}</h3>
                <p className="text-sm text-faint">{ledgerClientId} · FY {fy}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: "Billed", value: formatCurrency(totalBilled), color: "text-default" },
                  { label: "Direct Paid", value: formatCurrency(totalDirect), color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Applied Advance", value: formatCurrency(totalApplied), color: "text-amber-600 dark:text-amber-400" },
                  { label: "Pending", value: formatCurrency(pending), color: "text-red-600 dark:text-red-400" },
                  { label: "Advance Balance", value: formatCurrency(advBalance), color: "text-default" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-base bg-surface p-3">
                    <p className="text-xs text-faint">{item.label}</p>
                    <p className={`font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold text-default mb-2">Billing Records</p>
                {lb.length === 0 ? (
                  <p className="text-sm text-faint rounded-xl border border-base bg-surface p-4">No billing records for this FY.</p>
                ) : (
                  <div className="space-y-2">
                    {lb.map((b) => (
                      <div key={b._id} className="rounded-xl border border-base bg-surface p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-default">{formatCurrency(b.totalAmount)}</p>
                            <p className="text-xs text-faint">Paid {formatCurrency(b.totalPaid)} · Pending {formatCurrency(b.pendingAmount)}{b.dueDate ? ` · Due ${formatDate(b.dueDate)}` : ""}</p>
                          </div>
                          <PaymentStatusBadge status={b.paymentStatus} />
                        </div>
                        {b.notes && <p className="mt-2 text-xs text-muted">{b.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-default mb-2">All Payments</p>
                {lp.length === 0 ? (
                  <p className="text-sm text-faint rounded-xl border border-base bg-surface p-4">No payments for this FY.</p>
                ) : (
                  <TableWrapper><table className="w-full min-w-[600px]">
                    <thead><tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">Amount</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Mode</th>
                      <th className="table-header">Notes</th>
                    </tr></thead>
                    <tbody>
                      {lp.map((p) => (
                        <tr key={p._id} className="hover:bg-surface">
                          <td className="table-cell whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                          <td className="table-cell font-semibold">{formatCurrency(p.amountPaid)}</td>
                          <td className="table-cell whitespace-nowrap">{p.paymentType === "advance" ? "Advance balance" : isAppliedAdvancePayment(p) ? "Applied advance" : "Direct payment"}</td>
                          <td className="table-cell whitespace-nowrap">{p.paymentMode}</td>
                          <td className="table-cell text-faint text-xs">{p.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></TableWrapper>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Apply Advance Modal */}
      <Modal open={applyAdvanceModal} onClose={() => setApplyAdvanceModal(false)} title="Apply Advance to Billing">
        {applyAdvanceBilling && (() => {
          const clientAdv = advanceByClient.get(applyAdvanceBilling.clientId) || 0;
          const maxApply = Math.min(clientAdv, applyAdvanceBilling.pendingAmount);
          return (
            <form onSubmit={saveApplyAdvance} className="space-y-4">
              <div className="rounded-xl border border-base bg-surface p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted">Client</span><span className="font-medium text-default">{clientName(applyAdvanceBilling.clientId)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Financial Year</span><span className="font-medium text-default">FY {applyAdvanceBilling.financialYear}</span></div>
                <div className="border-t border-base my-1" />
                <div className="flex justify-between text-sm"><span className="text-muted">Advance balance</span><span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(clientAdv)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Pending billing</span><span className="font-semibold text-red-500">{formatCurrency(applyAdvanceBilling.pendingAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Max you can apply</span><span className="font-semibold text-default">{formatCurrency(maxApply)}</span></div>
              </div>
              <div>
                <label className="label">Amount to Apply *</label>
                <input type="number" className="input-field" value={applyForm.amountToApply} onChange={(e) => setApplyForm({ ...applyForm, amountToApply: e.target.value })} min="0.01" max={maxApply} step="0.01" placeholder="0.00" required />
                {Number(applyForm.amountToApply) > 0 && Number(applyForm.amountToApply) <= maxApply && (
                  <p className="text-xs text-faint mt-1">
                    After applying: advance balance → <span className="font-medium text-default">{formatCurrency(clientAdv - Number(applyForm.amountToApply))}</span>, pending billing → <span className="font-medium text-default">{formatCurrency(applyAdvanceBilling.pendingAmount - Number(applyForm.amountToApply))}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="label">Apply Date *</label>
                <input type="date" className="input-field" value={applyForm.applyDate} onChange={(e) => setApplyForm({ ...applyForm, applyDate: e.target.value })} required />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input-field" value={applyForm.notes} onChange={(e) => setApplyForm({ ...applyForm, notes: e.target.value })} placeholder="Optional note" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving || Number(applyForm.amountToApply) <= 0 || Number(applyForm.amountToApply) > maxApply}>
                  {saving ? "Applying…" : `Apply ${applyForm.amountToApply ? formatCurrency(Number(applyForm.amountToApply)) : ""}`}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setApplyAdvanceModal(false)}>Cancel</button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* Mark Invoice Created Modal */}
      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title={invoiceBilling?.invoiceCreated ? "Edit Invoice Details" : "Mark Invoice as Created"}>
        <form onSubmit={saveInvoiceStatus} className="space-y-4">
          <div className="rounded-xl border border-base bg-surface p-3 text-sm">
            <p className="text-faint text-xs mb-1">Client</p>
            <p className="font-medium text-default">{invoiceBilling ? clientName(invoiceBilling.clientId) : ""}</p>
            <p className="text-xs text-faint mt-0.5">FY {invoiceBilling?.financialYear} · {invoiceBilling ? formatCurrency(invoiceBilling.totalAmount) : ""}</p>
          </div>
          <div>
            <label className="label">Invoice Number <span className="text-faint font-normal">(optional)</span></label>
            <input className="input-field" placeholder="e.g. INV-2025-001" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} />
          </div>
          <div>
            <label className="label">Invoice Date <span className="text-faint font-normal">(optional)</span></label>
            <input type="date" className="input-field" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Invoice Amount <span className="text-faint font-normal">(optional)</span></label>
            <input type="number" className="input-field" placeholder={invoiceBilling ? String(invoiceBilling.totalAmount) : "0.00"} value={invoiceForm.invoiceAmount} min="0" step="0.01" onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceAmount: e.target.value })} />
            <p className="text-xs text-faint mt-1">Leave blank to use the billing total{invoiceBilling ? ` (${formatCurrency(invoiceBilling.totalAmount)})` : ""}.</p>
          </div>
          <p className="text-xs text-faint">Helps your accountant track which clients already have an invoice prepared.</p>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving…" : "Mark as Invoice Created"}</button>
            <button type="button" className="btn-secondary" onClick={() => setInvoiceModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={confirmState.open}
        onClose={closeConfirm}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
        note={confirmState.note}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
      />
    </div>
  );
}
