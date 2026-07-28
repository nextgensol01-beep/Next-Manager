"use client";
import type { CSSProperties } from "react";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { PendingChip, pendingRowClass } from "@/components/ui/PendingIndicator";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { WithPending } from "@/lib/usePendingList";
import { AlertCircle, ArrowDownLeft, CheckCircle2, Clock3, IndianRupee, Pencil, Plus, Receipt, Send, Trash2, Wallet } from "lucide-react";
import { formatDateTime, type Billing, type Payment } from "./ClientProfileSupport";

type ClientProfileBillingPaymentsProps = {
  selectedFy: string;
  billing: WithPending<Billing> | null;
  payments: WithPending<Payment>[];
  billingLastUpdated: string;
  hasFyData: boolean;
  isPWP: boolean;
  openReminderModal: (billing?: Billing) => void;
  openBillingModalForRecord: (billing?: Billing | null) => void;
  deleteBilling: (billing: Billing) => void;
  openFYModal: () => void;
  openPaymentModalForRecord: (payment?: Payment | null) => void;
  deletePayment: (paymentId: string) => void;
  view?: "all" | "billing" | "payments" | "ledger";
};

export default function ClientProfileBillingPayments({
  selectedFy,
  billing,
  payments,
  billingLastUpdated,
  hasFyData,
  isPWP,
  openReminderModal,
  openBillingModalForRecord,
  deleteBilling,
  openFYModal,
  openPaymentModalForRecord,
  deletePayment,
  view = "all",
}: ClientProfileBillingPaymentsProps) {
  const billingIsPending = billing?._status === "pending";
  const showBilling = view === "all" || view === "billing";
  const showPayments = view === "all" || view === "payments";
  const showLedger = view === "ledger";
  const directPayments = payments.filter((payment) => payment.paymentType !== "advance");
  const advancePayments = payments.filter((payment) => payment.paymentType === "advance");
  const paymentTotal = directPayments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const advanceTotal = advancePayments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const paymentProgress = billing?.totalAmount
    ? Math.min(100, Math.round((Number(billing.totalPaid || 0) / Number(billing.totalAmount)) * 100))
    : 0;
  const ledgerEntries = [
    ...(billing ? [{
      id: `billing-${billing._id}`,
      date: billing.invoiceDate || billing.createdAt || "",
      title: billing.invoiceNumber ? `Invoice ${billing.invoiceNumber}` : `Billing for FY ${selectedFy}`,
      detail: "Amount billed",
      amount: Number(billing.totalAmount || 0),
      kind: "debit" as const,
    }] : []),
    ...payments.map((payment) => ({
      id: payment._id,
      date: payment.paymentDate,
      title: payment.paymentType === "advance"
        ? "Advance received"
        : payment.source === "advance_application" ? "Advance applied" : "Payment received",
      detail: [payment.paymentMode, payment.referenceNumber].filter(Boolean).join(" · ") || "Payment entry",
      amount: Number(payment.amountPaid || 0),
      kind: "credit" as const,
    })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  return (
    <>
    {showBilling && <div className="client-profile-card client-profile-financial-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div>
            <p className="client-profile-kicker">Billing</p>
            <h3 className="text-xl font-semibold text-default">FY {selectedFy} billing</h3>
          </div>
          {billing && <PaymentStatusBadge status={billing.paymentStatus} />}
          {billing && <PendingChip status={billing._status} />}
        </div>
        <div className="flex items-center gap-2">
          {billing ? (
            <div className="glass-tray" style={{ gap: "3px" }}>
              {billing.pendingAmount > 0 && (
                <button type="button" className="glass-pill" disabled={billingIsPending} onClick={() => openReminderModal(billing)}>
                  <Send className="w-3 h-3" /> Reminder
                </button>
              )}
              <button type="button" className="glass-pill" disabled={billingIsPending} onClick={() => openBillingModalForRecord(billing)}>
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button type="button" className="glass-pill" style={{ color: "#ff3b30" }} disabled={billingIsPending} onClick={() => deleteBilling(billing)}>
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          ) : (
            <button type="button" className="glass-btn glass-btn-primary" onClick={() => openBillingModalForRecord()}>
              <Plus className="w-3.5 h-3.5" /> Create Billing
            </button>
          )}
        </div>
      </div>
      {billingLastUpdated && <p className="text-xs text-faint mb-4">Last updated {formatDateTime(billingLastUpdated)}</p>}
      {billing ? (
        <div className={`transition-opacity duration-200 ${billingIsPending ? "opacity-60" : ""}`}>
          <div className="client-profile-financial-payment-progress">
            <div>
              <span>Payment progress</span>
              <strong>{paymentProgress}%</strong>
            </div>
            <div aria-label={`${paymentProgress}% paid`}><span style={{ width: `${paymentProgress}%` }} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Govt Charges</p><p className="font-semibold">{formatCurrency(billing.govtCharges)}</p></div>
            <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Consultancy</p><p className="font-semibold">{formatCurrency(billing.consultancyCharges)}</p></div>
            <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Target Charges</p><p className="font-semibold">{formatCurrency(billing.targetCharges)}</p></div>
            <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Other Charges</p><p className="font-semibold">{formatCurrency(billing.otherCharges)}</p></div>
          </div>
          {billing.notes && <div className="rounded-xl bg-surface px-3 py-2.5 text-sm text-muted mb-4">{billing.notes}</div>}
          <div className="border-t border-soft pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="text-center"><p className="text-xs text-muted">Total Billed</p><p className="font-bold text-default">{formatCurrency(billing.totalAmount)}</p></div>
            <div className="text-center"><p className="text-xs text-muted">Paid</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(billing.totalPaid)}</p></div>
            <div className="text-center"><p className="text-xs text-muted">Pending</p><p className="font-bold text-red-500">{formatCurrency(billing.pendingAmount)}</p></div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm font-medium text-default">No billing recorded for FY {selectedFy}</p>
          <p className="text-sm text-faint mt-1">Create the first billing entry here so reminders and payment tracking can start.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <div className="glass-tray">
              <button type="button" className="glass-pill glass-pill-active" onClick={() => openBillingModalForRecord()}>
                Create Billing
              </button>
              {!hasFyData && (
                <button type="button" className="glass-pill" onClick={() => openFYModal()}>
                  {isPWP ? "Add Credit Data" : "Add FY Data"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>}

    {showPayments && <div className="client-profile-card client-profile-financial-card overflow-hidden !p-0">
      <div className="p-4 border-b border-base flex items-center justify-between gap-3">
        <div>
          <p className="client-profile-kicker">Payments & Advances</p>
          <h3 className="font-semibold text-default">Receipts for FY {selectedFy}</h3>
        </div>
        <button type="button" className="client-profile-primary-button" onClick={() => openPaymentModalForRecord()}>
          <Plus className="w-3.5 h-3.5" /> Add Payment
        </button>
      </div>
      <div className="client-profile-financial-payment-summary">
        <div><span><ArrowDownLeft className="h-4 w-4" /></span><p>Payments received<strong>{formatCurrency(paymentTotal)}</strong></p></div>
        <div><span><Wallet className="h-4 w-4" /></span><p>Advance received<strong>{formatCurrency(advanceTotal)}</strong></p></div>
        <div><span><Receipt className="h-4 w-4" /></span><p>Total entries<strong>{payments.length}</strong></p></div>
      </div>
      {payments.length > 0 ? (
        <>
          <div className="client-profile-table-scroll client-profile-payment-desktop-table">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Mode</th>
                  <th className="table-header">Reference</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p._id}
                    className={`border-t border-soft transition-all duration-200 ${
                      p._status ? pendingRowClass(p._status) : "hover:bg-surface"
                    }`}
                  >
                    <td className="table-cell">{formatDate(p.paymentDate)}</td>
                    <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentType === "advance" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                        {p.paymentType === "advance" ? "Advance" : p.source === "advance_application" ? "Advance applied" : "Payment"}
                      </span>
                    </td>
                    <td className="table-cell">{p.paymentMode}</td>
                    <td className="table-cell text-faint">{p.referenceNumber || "-"}</td>
                    <td className="table-cell">
                      <PendingChip status={p._status} />
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openPaymentModalForRecord(p)}
                          disabled={!!p._status}
                          className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Edit payment"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={!!p._status}
                          onClick={() => deletePayment(p._id)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Delete payment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="client-profile-payment-mobile-list">
            {payments.map((p) => (
              <div key={p._id} className={`rounded-2xl border border-base bg-surface/70 p-4 ${p._status ? pendingRowClass(p._status) : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</p>
                    <p className="text-xs text-faint">{formatDate(p.paymentDate)} - {p.paymentMode}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentType === "advance" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                    {p.paymentType === "advance" ? "Advance" : p.source === "advance_application" ? "Advance applied" : "Payment"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted">Ref: {p.referenceNumber || "-"}</p>
                    <PendingChip status={p._status} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openPaymentModalForRecord(p)}
                      disabled={!!p._status}
                      className="client-profile-icon-button"
                      aria-label="Edit payment"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={!!p._status}
                      onClick={() => deletePayment(p._id)}
                      className="client-profile-icon-button client-profile-danger-icon"
                      aria-label="Delete payment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="p-6 text-center">
          <p className="text-sm font-medium text-default">No payments recorded for FY {selectedFy}</p>
          <p className="text-sm text-faint mt-1">Record billing or advance payments here without leaving the profile page.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <div className="glass-tray">
              <button type="button" className="glass-pill glass-pill-active" onClick={() => openPaymentModalForRecord()}>
                Add Payment
              </button>
              {billing && billing.pendingAmount > 0 && (
                <button type="button" className="glass-pill" onClick={() => openReminderModal()}>
                  Send Reminder
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>}

    {showLedger && <section className="client-profile-card client-profile-financial-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Ledger</p>
          <h2>Financial activity · FY {selectedFy}</h2>
          <span>Billing and receipts in one read-only chronological view.</span>
        </div>
      </div>
      {ledgerEntries.length ? (
        <div className="client-profile-financial-ledger">
          {ledgerEntries.map((entry) => (
            <div key={entry.id}>
              <span className="client-profile-financial-neutral-icon">
                {entry.kind === "debit" ? <IndianRupee className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </span>
              <div>
                <strong>{entry.title}</strong>
                <small>{entry.detail}</small>
              </div>
              <time>{entry.date ? formatDate(entry.date) : "—"}</time>
              <b data-kind={entry.kind}>{entry.kind === "debit" ? "+" : "−"}{formatCurrency(entry.amount)}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="client-profile-financial-empty-state">
          <Clock3 className="h-5 w-5" />
          <strong>No ledger activity for FY {selectedFy}</strong>
          <span>Billing and payment entries will appear here automatically.</span>
        </div>
      )}
    </section>}
    </>
  );
}

export function FinancialOverviewPanel({
  selectedFy,
  billing,
  payments,
  acceptedQuotationCount,
  isPWP,
  onCreateBilling,
  onAddPayment,
  onSendReminder,
  onOpenSection,
}: {
  selectedFy: string;
  billing: WithPending<Billing> | null;
  payments: WithPending<Payment>[];
  acceptedQuotationCount: number;
  isPWP: boolean;
  onCreateBilling: () => void;
  onAddPayment: () => void;
  onSendReminder: () => void;
  onOpenSection: (section: "quotations" | "billing" | "payments" | "ledger") => void;
}) {
  const total = Number(billing?.totalAmount || 0);
  const paid = Number(billing?.totalPaid || 0);
  const pending = Number(billing?.pendingAmount || 0);
  const advances = payments.filter((payment) => payment.paymentType === "advance")
    .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const progress = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const settled = Boolean(billing && pending <= 0);

  return (
    <div className="client-profile-section-stack">
      <section className="client-profile-card client-profile-financial-overview">
        <div className="client-profile-card-header">
          <div>
            <p className="client-profile-kicker">Financial Overview</p>
            <h2>FY {selectedFy} at a glance</h2>
            <span>Billing, receipts and outstanding balance in one clear view.</span>
          </div>
          <span className="client-profile-status-pill" data-state={settled ? "complete" : billing ? "progress" : "neutral"}>
            {settled ? "Settled" : billing ? billing.paymentStatus : "Not billed"}
          </span>
        </div>

        <div className="client-profile-financial-hero">
          <div className="client-profile-financial-ring" style={{ "--financial-progress": `${progress * 3.6}deg` } as CSSProperties}>
            <div><strong>{progress}%</strong><span>paid</span></div>
          </div>
          <div><span>Total billed</span><strong>{formatCurrency(total)}</strong></div>
          <div><span>Received</span><strong>{formatCurrency(paid)}</strong></div>
          <div><span>Outstanding</span><strong data-alert={pending > 0}>{formatCurrency(pending)}</strong></div>
          <div><span>Advance received</span><strong>{formatCurrency(advances)}</strong></div>
        </div>

        <div className="client-profile-financial-next-step">
          <span>{settled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}</span>
          <div>
            <strong>{settled ? "Account settled for this financial year" : !billing ? "Create billing to begin payment tracking" : "Payment follow-up is required"}</strong>
            <small>{settled ? "All billed charges have been received." : !billing ? "Once billing is created, receipts and outstanding balance update automatically." : `${formatCurrency(pending)} remains outstanding.`}</small>
          </div>
          <button type="button" className="client-profile-primary-button" onClick={!billing ? onCreateBilling : settled ? onAddPayment : onSendReminder}>
            {!billing ? "Create Billing" : settled ? "Add Payment" : "Send Reminder"}
          </button>
        </div>
      </section>

      <section className="client-profile-financial-shortcuts">
        {!isPWP && <button type="button" onClick={() => onOpenSection("quotations")}><Receipt className="h-4 w-4" /><span>Quotations<small>{acceptedQuotationCount} accepted</small></span></button>}
        <button type="button" onClick={() => onOpenSection("billing")}><IndianRupee className="h-4 w-4" /><span>Billing<small>{billing ? billing.paymentStatus : "Not created"}</small></span></button>
        <button type="button" onClick={() => onOpenSection("payments")}><Wallet className="h-4 w-4" /><span>Payments & Advances<small>{payments.length} entries</small></span></button>
        <button type="button" onClick={() => onOpenSection("ledger")}><Clock3 className="h-4 w-4" /><span>Ledger<small>View activity</small></span></button>
      </section>
    </div>
  );
}
