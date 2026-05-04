"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { FINANCIAL_YEARS, formatCurrency, formatDate, PAYMENT_MODES, getPaymentPercentage } from "@/lib/utils";
import { Plus, Send, FileText, ChevronDown, ChevronUp, Trash2, Search, X, Wallet, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";

interface ClientContact { _id: string; name: string; email?: string; emails?: string[]; allEmails?: string[]; mobile?: string; }
interface Client { clientId: string; companyName: string; category: string; contacts?: ClientContact[]; }
interface Billing { _id: string; clientId: string; financialYear: string; govtCharges: number; consultancyCharges: number; targetCharges: number; otherCharges: number; totalAmount: number; notes?: string; totalPaid: number; pendingAmount: number; paymentStatus: string; }
interface Payment { _id: string; clientId: string; financialYear: string; amountPaid: number; paymentType?: "billing" | "advance"; paymentDate: string; paymentMode: string; referenceNumber?: string; notes?: string; }
interface EmailOption { label: string; email: string; }
type BillingFilter = "all" | "pending" | "paid" | "partial" | "unpaid" | "advance";
type CreditType = "RECYCLING" | "EOL";
interface TargetEntry { categoryId: string; type: CreditType; value: number; }
interface FinancialYearRecord { targets?: TargetEntry[]; cat1Target?: number; cat2Target?: number; cat3Target?: number; cat4Target?: number; targetCat1?: number; targetCat2?: number; targetCat3?: number; targetCat4?: number; }
interface CreditTransaction { creditType?: "Recycling" | "EOL"; rateCat1?: number; rateCat2?: number; rateCat3?: number; rateCat4?: number; rate?: number; date?: string; }
interface TargetBillingRow {
  key: string;
  categoryId: string;
  type: CreditType;
  quantity: string;
  rate: string;
  gstPercent: string;
  include: boolean;
  rateSource: "transaction" | "manual";
}

const PIBO_CATEGORIES = new Set(["Producer", "Importer", "Brand Owner"]);
const CATEGORY_LABELS: Record<string, string> = {
  "1": "Category I",
  "2": "Category II",
  "3": "Category III",
  "4": "Category IV",
};

function normalizeCreditType(value: unknown): CreditType {
  return String(value).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

function targetEntriesFromRecord(record?: FinancialYearRecord | null): TargetEntry[] {
  if (!record) return [];
  if (Array.isArray(record.targets) && record.targets.length > 0) {
    return record.targets
      .map((target) => ({
        categoryId: String(target.categoryId),
        type: normalizeCreditType(target.type),
        value: Number(target.value || 0),
      }))
      .filter((target) => target.value > 0);
  }

  return [1, 2, 3, 4]
    .map((categoryId) => ({
      categoryId: String(categoryId),
      type: "RECYCLING" as CreditType,
      value: Number(
        record[`cat${categoryId}Target` as keyof FinancialYearRecord] ??
        record[`targetCat${categoryId}` as keyof FinancialYearRecord] ??
        0
      ),
    }))
    .filter((target) => target.value > 0);
}

function rateForTarget(transactions: CreditTransaction[], target: TargetEntry) {
  const rateField = `rateCat${target.categoryId}` as keyof CreditTransaction;
  const match = transactions.find((tx) => normalizeCreditType(tx.creditType) === target.type && Number(tx[rateField] || tx.rate || 0) > 0);
  return Number(match?.[rateField] || match?.rate || 0);
}

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
  const [fy, setFy, financialYearLoaded] = useFinancialYearState();
  const { effectiveFinancialYear } = useFinancialYearPreference();
  const [billingModal, setBillingModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingFilter>("all");
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
  const [targetRows, setTargetRows] = useState<TargetBillingRow[]>([]);
  const [targetSuggestionsLoading, setTargetSuggestionsLoading] = useState(false);
  const [targetSuggestionsError, setTargetSuggestionsError] = useState("");
  const [useTransactionRates, setUseTransactionRates] = useState(true);

  const { data: billings, loading: bLoading, refetch: refetchBillings } = useCache<Billing[]>(`/api/billing?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: payments, refetch: refetchPayments } = useCache<Payment[]>(`/api/payments?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: clients } = useCache<Client[]>("/api/clients", { initialData: [] });
  const loading = !financialYearLoaded || bLoading;

  const clientName = useCallback((id: string) => clients.find((c) => c.clientId === id)?.companyName || id, [clients]);
  const clientPayments = (id: string) => payments.filter((p) => p.clientId === id && p.paymentType !== "advance");

  const advanceByClient = useMemo(() => {
    const map = new Map<string, number>();
    payments
      .filter((payment) => payment.paymentType === "advance")
      .forEach((payment) => {
        map.set(payment.clientId, (map.get(payment.clientId) || 0) + Number(payment.amountPaid || 0));
      });
    return map;
  }, [payments]);

  const billingSummary = useMemo(() => {
    const totalBilled = billings.reduce((sum, billing) => sum + Number(billing.totalAmount || 0), 0);
    const totalCollected = billings.reduce((sum, billing) => sum + Number(billing.totalPaid || 0), 0);
    const totalPending = billings.reduce((sum, billing) => sum + Number(billing.pendingAmount || 0), 0);
    const totalAdvance = payments
      .filter((payment) => payment.paymentType === "advance")
      .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const paidCount = billings.filter((billing) => billing.pendingAmount <= 0 || billing.paymentStatus.toLowerCase() === "paid").length;
    const partialCount = billings.filter((billing) => billing.pendingAmount > 0 && billing.totalPaid > 0).length;
    const unpaidCount = billings.filter((billing) => billing.pendingAmount > 0 && billing.totalPaid <= 0).length;
    const collectionPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

    return {
      totalBilled,
      totalCollected,
      totalPending,
      totalAdvance,
      paidCount,
      partialCount,
      unpaidCount,
      pendingCount: partialCount + unpaidCount,
      collectionPct,
    };
  }, [billings, payments]);

  const filteredBillings = useMemo(() => {
    const q = search.toLowerCase();
    return billings.filter((b) => {
      const name = clientName(b.clientId).toLowerCase();
      const matchesSearch = !search.trim() ||
        name.includes(q) ||
        b.clientId.toLowerCase().includes(q) ||
        b.paymentStatus.toLowerCase().includes(q);
      const matchesFilter =
        statusFilter === "all" ||
        (statusFilter === "pending" && b.pendingAmount > 0) ||
        (statusFilter === "paid" && (b.pendingAmount <= 0 || b.paymentStatus.toLowerCase() === "paid")) ||
        (statusFilter === "partial" && b.pendingAmount > 0 && b.totalPaid > 0) ||
        (statusFilter === "unpaid" && b.pendingAmount > 0 && b.totalPaid <= 0) ||
        (statusFilter === "advance" && (advanceByClient.get(b.clientId) || 0) > 0);
      return matchesSearch && matchesFilter;
    });
  }, [advanceByClient, billings, search, statusFilter, clientName]);

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
  const selectedBillingClient = clients.find((client) => client.clientId === bForm.clientId);
  const isPiboBillingClient = Boolean(selectedBillingClient && PIBO_CATEGORIES.has(selectedBillingClient.category));
  const targetRowsTotal = useMemo(() => targetRows.reduce((sum, row) => {
    if (!row.include) return sum;
    const taxable = Number(row.quantity || 0) * Number(row.rate || 0);
    const gstAmount = taxable * (Number(row.gstPercent || 0) / 100);
    return sum + taxable + gstAmount;
  }, 0), [targetRows]);

  useEffect(() => {
    if (!billingModal || !bForm.clientId || !bForm.financialYear || !isPiboBillingClient) {
      setTargetRows([]);
      setTargetSuggestionsError("");
      return;
    }

    let cancelled = false;
    const loadTargetSuggestions = async () => {
      setTargetSuggestionsLoading(true);
      setTargetSuggestionsError("");
      try {
        const [fyResponse, txResponse] = await Promise.all([
          fetch(`/api/financial-year?clientId=${encodeURIComponent(bForm.clientId)}&fy=${encodeURIComponent(bForm.financialYear)}`, { cache: "no-store" }),
          fetch(`/api/credit-transactions?toClientId=${encodeURIComponent(bForm.clientId)}&fy=${encodeURIComponent(bForm.financialYear)}`, { cache: "no-store" }),
        ]);
        const fyBody = await fyResponse.json().catch(() => null);
        const txBody = await txResponse.json().catch(() => null);

        if (!fyResponse.ok) throw new Error(fyBody?.error || "Failed to load target data");
        if (!txResponse.ok) throw new Error(txBody?.error || "Failed to load transaction rates");

        const record = Array.isArray(fyBody) ? fyBody[0] as FinancialYearRecord | undefined : null;
        const targets = targetEntriesFromRecord(record);
        const transactions = Array.isArray(txBody) ? txBody as CreditTransaction[] : [];

        if (cancelled) return;
        setTargetRows(targets.map((target) => {
          const transactionRate = useTransactionRates ? rateForTarget(transactions, target) : 0;
          return {
            key: `${target.categoryId}-${target.type}`,
            categoryId: target.categoryId,
            type: target.type,
            quantity: String(target.value),
            rate: transactionRate > 0 ? String(transactionRate) : "",
            gstPercent: "18",
            include: true,
            rateSource: transactionRate > 0 ? "transaction" : "manual",
          };
        }));
      } catch (error) {
        if (cancelled) return;
        setTargetRows([]);
        setTargetSuggestionsError(error instanceof Error ? error.message : "Failed to load target suggestions");
      } finally {
        if (!cancelled) setTargetSuggestionsLoading(false);
      }
    };

    loadTargetSuggestions();

    return () => {
      cancelled = true;
    };
  }, [billingModal, bForm.clientId, bForm.financialYear, isPiboBillingClient, useTransactionRates]);

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

  const advanceClientCount = Array.from(advanceByClient.values()).filter((amount) => amount > 0).length;
  const filterOptions: Array<{ value: BillingFilter; label: string; count: number }> = [
    { value: "all", label: "All", count: billings.length },
    { value: "pending", label: "Pending", count: billingSummary.pendingCount },
    { value: "partial", label: "Partial", count: billingSummary.partialCount },
    { value: "unpaid", label: "Unpaid", count: billingSummary.unpaidCount },
    { value: "paid", label: "Paid", count: billingSummary.paidCount },
    { value: "advance", label: "Has Advance", count: advanceClientCount },
  ];

  return (
    <div>
      <PageHeader title="Billing & Payments" description="Manage invoices and payment collection">
        <div className="glass-tray">
          <button className="glass-pill" onClick={openAdvancePaymentModal}><Plus className="w-3.5 h-3.5" /> Record Advance</button>
          <button className="glass-pill glass-pill-active" onClick={openBillingModal}><Plus className="w-3.5 h-3.5" /> Add Billing</button>
        </div>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        <div className="bg-card border border-base rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-faint">Total Billed</p>
              <p className="text-xl font-bold text-default mt-2">{formatCurrency(billingSummary.totalBilled)}</p>
              <p className="text-xs text-faint mt-1">{billings.length} billing records</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-300 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-base rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-faint">Collected</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{formatCurrency(billingSummary.totalCollected)}</p>
              <p className="text-xs text-faint mt-1">{billingSummary.collectionPct}% collection rate</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-base rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-faint">Pending</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-2">{formatCurrency(billingSummary.totalPending)}</p>
              <p className="text-xs text-faint mt-1">{billingSummary.pendingCount} records need follow-up</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-300 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-base rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-faint">Advance</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-2">{formatCurrency(billingSummary.totalAdvance)}</p>
              <p className="text-xs text-faint mt-1">{advanceClientCount} clients with advance</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-base rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-faint">Paid Records</p>
              <p className="text-xl font-bold text-default mt-2">{billingSummary.paidCount}</p>
              <p className="text-xs text-faint mt-1">{billingSummary.partialCount} partial, {billingSummary.unpaidCount} unpaid</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-900/25 dark:text-teal-300 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

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

      <div className="flex flex-wrap gap-2 mb-4">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatusFilter(option.value)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === option.value
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-300"
                : "border-base bg-card text-muted hover:text-default"
            }`}
          >
            {option.label}
            <span className="rounded-full bg-surface border border-base px-1.5 py-0.5 text-[10px] text-faint">
              {option.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : billings.length === 0 ? (
        <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
          <EmptyState message="No billing records for this FY" description="Add billing for a client to get started" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBillings.length === 0 ? (
            <div className="bg-card rounded-2xl p-8 shadow-sm border border-base"><EmptyState message="No matching billing records" description="Try a different search or filter" /></div>
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

                  <div className="glass-tray" style={{ flexWrap: "wrap" }}>
                    <button className="glass-pill glass-pill-active" onClick={() => openPaymentModal(billing)}><Plus className="w-3.5 h-3.5" /> Add Payment</button>
                    <button className="glass-pill" onClick={() => openEmailModal(billing)}><Send className="w-3.5 h-3.5" /> Send Reminder</button>
                    <button className="glass-pill" onClick={() => toggleRow(billing._id)}>
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
          {bForm.clientId && (
            <div className="rounded-2xl border border-base bg-surface p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-default">PIBO Target Suggestions</p>
                  <p className="text-xs text-faint mt-1">
                    {isPiboBillingClient
                      ? "Targets come from Financial Year records. Rates can be pulled from received credit transactions and edited before applying."
                      : "Available only for Producer, Importer, and Brand Owner clients."}
                  </p>
                </div>
                {isPiboBillingClient && (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-muted">
                    <input
                      type="checkbox"
                      checked={useTransactionRates}
                      onChange={(event) => setUseTransactionRates(event.target.checked)}
                      className="h-4 w-4 rounded border-base"
                    />
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
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-faint">
                          <th className="py-2 pr-3">Use</th>
                          <th className="py-2 pr-3">Category</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Target Qty</th>
                          <th className="py-2 pr-3">Rate</th>
                          <th className="py-2 pr-3">GST %</th>
                          <th className="py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetRows.map((row) => {
                          const taxable = Number(row.quantity || 0) * Number(row.rate || 0);
                          const gstAmount = taxable * (Number(row.gstPercent || 0) / 100);
                          const total = taxable + gstAmount;
                          return (
                            <tr key={row.key} className="border-t border-soft">
                              <td className="py-2 pr-3">
                                <input
                                  type="checkbox"
                                  checked={row.include}
                                  onChange={(event) => setTargetRows((rows) => rows.map((entry) => entry.key === row.key ? { ...entry, include: event.target.checked } : entry))}
                                  className="h-4 w-4 rounded border-base"
                                />
                              </td>
                              <td className="py-2 pr-3 text-default">{CATEGORY_LABELS[row.categoryId] || `Category ${row.categoryId}`}</td>
                              <td className="py-2 pr-3 text-muted">{row.type === "EOL" ? "EOL" : "Recycling"}</td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  className="input-field !py-1.5"
                                  value={row.quantity}
                                  min="0"
                                  step="0.01"
                                  onChange={(event) => setTargetRows((rows) => rows.map((entry) => entry.key === row.key ? { ...entry, quantity: event.target.value } : entry))}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <div className="space-y-1">
                                  <input
                                    type="number"
                                    className="input-field !py-1.5"
                                    value={row.rate}
                                    min="0"
                                    step="0.01"
                                    placeholder="Manual"
                                    onChange={(event) => setTargetRows((rows) => rows.map((entry) => entry.key === row.key ? { ...entry, rate: event.target.value, rateSource: "manual" } : entry))}
                                  />
                                  <p className="text-[10px] text-faint">{row.rateSource === "transaction" ? "From transaction" : "Editable"}</p>
                                </div>
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  className="input-field !py-1.5"
                                  value={row.gstPercent}
                                  min="0"
                                  step="0.01"
                                  onChange={(event) => setTargetRows((rows) => rows.map((entry) => entry.key === row.key ? { ...entry, gstPercent: event.target.value } : entry))}
                                />
                              </td>
                              <td className="py-2 text-right font-semibold text-default">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-base bg-card p-3">
                    <div>
                      <p className="text-xs text-faint">GST-inclusive target suggestion</p>
                      <p className="text-lg font-bold text-default">{formatCurrency(targetRowsTotal)}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setBForm((form) => ({ ...form, targetCharges: targetRowsTotal.toFixed(2) }))}
                      disabled={targetRowsTotal <= 0}
                    >
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
