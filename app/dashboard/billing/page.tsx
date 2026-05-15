"use client";
import React, { useState, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import BillingSkeleton from "@/components/ui/BillingSkeleton";
import { formatCurrency } from "@/lib/utils";
import {
  Plus, Download, Mail,
} from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";
import BillingTopControls from "./BillingTopControls";
import BillingSummaryStats from "./BillingSummaryStats";
import BillingSearchFilters from "./BillingSearchFilters";
import AdvancePaymentsSection from "./AdvancePaymentsSection";
import BillingModal from "./BillingModal";
import PaymentModal, { type PaymentModalTarget } from "./PaymentModal";
import EmailReminderModal from "./EmailReminderModal";
import LedgerModal from "./LedgerModal";
import ApplyAdvanceModal from "./ApplyAdvanceModal";
import InvoiceModal from "./InvoiceModal";
import BulkReminderModal from "./BulkReminderModal";
import { useBillingScrollState } from "./useBillingScrollState";
import { useBillingMutations } from "./useBillingMutations";
import BillingList from "./BillingList";
import type {
  AdvanceClientRow,
  Billing,
  BillingFilter,
  BillingTab,
  Client,
  Payment,
  ViewMode,
} from "./types";
import {
  isAppliedAdvancePayment,
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
  const [billingModal, setBillingModal] = useState<false | "new" | Billing>(false);
  const [bulkReminderOpen, setBulkReminderOpen] = useState(false);

  // Modal data
  const [paymentModalTarget, setPaymentModalTarget] = useState<PaymentModalTarget>(false);
  const [emailBilling, setEmailBilling] = useState<Billing | null>(null);
  const [ledgerClientId, setLedgerClientId] = useState<string | null>(null);
  const [invoiceBilling, setInvoiceBilling] = useState<Billing | null>(null);
  const [applyAdvanceBilling, setApplyAdvanceBilling] = useState<Billing | null>(null);

  // UI state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedAdvanceClients, setExpandedAdvanceClients] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<BillingTab>("billing");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  // Confirm modal
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; description?: string; note?: string;
    confirmLabel?: string; variant?: "danger" | "warning"; onConfirm: () => void | Promise<void>;
  }>({ open: false, title: "", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, open: false }));

  // Data
  const { data: billings, loading: bLoading, refetch: refetchBillings, mutate: mutateBillings } = useCache<Billing[]>(`/api/billing?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: payments, refetch: refetchPayments, mutate: mutatePayments } = useCache<Payment[]>(`/api/payments?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: clients } = useCache<Client[]>("/api/clients", { initialData: [] });
  const loading = !financialYearLoaded || bLoading;

  const clientName = useCallback((id: string) => clients.find((c) => c.clientId === id)?.companyName || id, [clients]);

  const paymentsByClient = useMemo(() => {
    const map = new Map<string, Payment[]>();
    payments.forEach((payment) => {
      if (payment.paymentType === "advance") return;
      const clientPayments = map.get(payment.clientId);
      if (clientPayments) clientPayments.push(payment);
      else map.set(payment.clientId, [payment]);
    });
    return map;
  }, [payments]);

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
    const invoicePendingCount = billings.filter((b) => !b.invoiceCreated).length;
    const invoiceCreatedCount = billings.filter((b) => b.invoiceCreated === true).length;
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
    return { totalBilled, totalCollected, totalPending, totalAdvance, invoiceGap, invoicePendingCount, invoiceCreatedCount, paidCount, partialCount, unpaidCount, pendingCount: partialCount + unpaidCount, collectionPct, overdueCount, aging };
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
  const openBillingModal = useCallback(() => {
    setBillingModal("new");
  }, []);

  const openEditBillingModal = useCallback((billing: Billing) => {
    setBillingModal(billing);
  }, []);

  const {
    refreshBillingData,
    applyOptimisticPayment,
    applyOptimisticAdvanceApplication,
  } = useBillingMutations({
    billings,
    payments,
    mutateBillings,
    mutatePayments,
    refetchBillings,
    refetchPayments,
  });

  const openLedgerModal = useCallback((clientId: string) => { setLedgerClientId(clientId); }, []);

  const openPaymentModal = useCallback((billing: Billing) => {
    setPaymentModalTarget(billing);
  }, []);

  const openAdvancePaymentModal = useCallback(() => {
    setPaymentModalTarget("advance");
  }, []);

  const openEmailModal = useCallback((billing: Billing) => {
    setEmailBilling(billing);
  }, []);

  const openInvoiceModal = useCallback((billing: Billing) => {
    setInvoiceBilling(billing);
  }, []);

  const openApplyAdvanceModal = useCallback((billing: Billing) => {
    setApplyAdvanceBilling(billing);
  }, []);

  const markInvoiceNotCreated = useCallback(async (billing: Billing) => {
    const r = await fetch(`/api/billing/${billing._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceCreated: false, invoiceNumber: "", invoiceDate: null, invoiceAmount: null }) });
    if (r.ok) { toast.success("Invoice marked as not created"); invalidate("/api/billing"); refetchBillings(); }
    else toast.error("Failed to update invoice status");
  }, [refetchBillings]);

  const deleteBilling = useCallback((id: string, clientId: string) => {
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
  }, [clientName, refetchBillings, refetchPayments]);

  const deletePayment = useCallback((id: string) => {
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
  }, [refetchBillings, refetchPayments]);

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const toggleAdvanceClient = useCallback((clientId: string) => {
    setExpandedAdvanceClients((prev) => {
      const s = new Set(prev);
      if (s.has(clientId)) s.delete(clientId); else s.add(clientId);
      return s;
    });
  }, []);

  const exportBillingCsv = useCallback(() => {
    const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = filteredBillings.map((b) => [b.clientId, clientName(b.clientId), b.financialYear, b.govtCharges, b.consultancyCharges, b.targetCharges, b.otherCharges, b.totalAmount, b.totalPaid, b.pendingAmount, b.paymentStatus, b.dueDate ? formatDate(b.dueDate) : "", b.daysOverdue || 0, advanceByClient.get(b.clientId) || 0, b.invoiceCreated ? "Yes" : "No", b.invoiceNumber || "", b.notes || ""]);
    const csv = [["Client ID", "Client", "FY", "Govt", "Consultancy", "Target", "Other", "Total", "Paid", "Pending", "Status", "Due Date", "Days Overdue", "Advance Balance", "Invoice Created", "Invoice No.", "Notes"], ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `billing-payments-${fy}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, [filteredBillings, clientName, advanceByClient, fy]);

  // ── Derived UI values ─────────────────────────────────────────────────────
  const advanceClientCount = advanceClientRows.filter((row) => row.available > 0).length;
  const billingAdvanceRecordCount = billings.filter((b) => (advanceByClient.get(b.clientId) || 0) > 0).length;
  const appliedAdvanceTotal = appliedAdvancePayments.reduce((s, p) => s + Number(p.amountPaid || 0), 0);

  const filterOptions: Array<{ value: BillingFilter; label: string; count: number; separator?: boolean }> = useMemo(() => [
    { value: "all", label: "All", count: billings.length },
    { value: "pending", label: "Pending", count: billingSummary.pendingCount },
    { value: "partial", label: "Partial", count: billingSummary.partialCount },
    { value: "unpaid", label: "Unpaid", count: billingSummary.unpaidCount },
    { value: "paid", label: "Paid", count: billingSummary.paidCount },
    { value: "advance", label: "Has Advance", count: billingAdvanceRecordCount },
    { value: "overdue", label: "Overdue", count: billingSummary.overdueCount },
    { value: "invoice-pending", label: "Invoice Pending", count: billingSummary.invoicePendingCount, separator: true },
    { value: "invoice-created", label: "Invoice Created", count: billingSummary.invoiceCreatedCount },
  ], [billingAdvanceRecordCount, billingSummary, billings.length]);

  // ── Target suggestions loader ──────────────────────────────────────────────
  // ── Two-phase scroll architecture ───────────────────────────────────────
  const anyModalOpen =
    Boolean(billingModal) ||
    Boolean(paymentModalTarget) ||
    Boolean(emailBilling) ||
    Boolean(ledgerClientId) ||
    Boolean(invoiceBilling) ||
    Boolean(applyAdvanceBilling) ||
    bulkReminderOpen ||
    confirmState.open;

  const {
    scrollProgress,
    searchBarStickyTop,
    headerMerged,
    headerDocked,
    topControlsHeight,
    setTopControlsHeight,
    setStatsContentHeight,
    isMobile,
  } = useBillingScrollState({ activeTab, anyModalOpen });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Billing & Payments" description="Manage invoices and payment collection">
        <div className="glass-tray flex-wrap gap-y-1.5">
          <button className="glass-pill" onClick={exportBillingCsv} disabled={filteredBillings.length === 0}><Download className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">Export CSV</span><span className="xs:hidden sm:hidden">Export</span></button>
          <button className="glass-pill" onClick={() => setBulkReminderOpen(true)}><Mail className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">Bulk Reminders</span><span className="xs:hidden sm:hidden">Reminders</span></button>
          <button className="glass-pill" onClick={openAdvancePaymentModal}><Plus className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">Record Advance</span><span className="xs:hidden sm:hidden">Advance</span></button>
          <button className="glass-pill glass-pill-active" onClick={openBillingModal}><Plus className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">Add Billing</span><span className="xs:hidden sm:hidden">Add</span></button>
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
        docked={headerDocked && activeTab === "billing"}
        dockOffset={isMobile ? 16 : 24}
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
            isMobile={isMobile}
            docked={headerDocked}
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
            docked={headerDocked}
            dockOffset={isMobile ? 16 : 24}
            stickyTop={topControlsHeight}
            stickyTopOffset={isMobile ? undefined : searchBarStickyTop}
          />
         
        </>
      )}

      {activeTab === "billing" && (
        <>
      {/* ── Billing list ─────────────────────────────────────────────────── */}
      {loading ? <BillingSkeleton /> : (
        <BillingList
          billings={billings}
          filteredBillings={filteredBillings}
          payments={payments}
          loading={loading}
          viewMode={viewMode}
          expandedRows={expandedRows}
          paymentsByClient={paymentsByClient}
          advanceByClient={advanceByClient}
          clientName={clientName}
          onToggleRow={toggleRow}
          onOpenPaymentModal={openPaymentModal}
          onOpenApplyAdvanceModal={openApplyAdvanceModal}
          onOpenLedgerModal={openLedgerModal}
          onOpenEmailModal={openEmailModal}
          onOpenInvoiceModal={openInvoiceModal}
          onOpenEditBillingModal={openEditBillingModal}
          onMarkInvoiceNotCreated={markInvoiceNotCreated}
          onDeleteBilling={deleteBilling}
          onDeletePayment={deletePayment}
        />
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
      <BulkReminderModal
        open={bulkReminderOpen}
        billings={billings}
        clients={clients}
        fy={fy}
        onClose={() => setBulkReminderOpen(false)}
      />

      <BillingModal
        open={Boolean(billingModal)}
        editingBilling={billingModal && billingModal !== "new" ? billingModal : null}
        clients={clients}
        fy={fy}
        onClose={() => setBillingModal(false)}
        onSaved={() => {
          setBillingModal(false);
          refreshBillingData();
        }}
      />

      <PaymentModal
        target={paymentModalTarget}
        clients={clients}
        fy={fy}
        effectiveFinancialYear={effectiveFinancialYear}
        onOptimisticPayment={applyOptimisticPayment}
        onClose={() => setPaymentModalTarget(false)}
        onSaved={() => {
          setPaymentModalTarget(false);
          refreshBillingData();
        }}
      />

      <EmailReminderModal
        billing={emailBilling}
        clients={clients}
        onClose={() => setEmailBilling(null)}
      />

      <LedgerModal
        clientId={ledgerClientId}
        billings={billings}
        payments={payments}
        advanceBalance={ledgerClientId ? advanceByClient.get(ledgerClientId) || 0 : 0}
        clientName={clientName}
        onClose={() => setLedgerClientId(null)}
        fy={fy}
      />

      <ApplyAdvanceModal
        billing={applyAdvanceBilling}
        advanceBalance={applyAdvanceBilling ? advanceByClient.get(applyAdvanceBilling.clientId) || 0 : 0}
        clientName={clientName}
        onOptimisticApply={applyOptimisticAdvanceApplication}
        onClose={() => setApplyAdvanceBilling(null)}
        onApplied={() => {
          setApplyAdvanceBilling(null);
          refreshBillingData();
        }}
      />

      <InvoiceModal
        billing={invoiceBilling}
        clientName={clientName}
        onClose={() => setInvoiceBilling(null)}
        onSaved={() => {
          setInvoiceBilling(null);
          invalidate("/api/billing");
          refetchBillings();
        }}
      />

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
