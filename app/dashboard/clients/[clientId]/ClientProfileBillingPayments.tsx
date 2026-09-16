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
  billings: WithPending<Billing>[];
  payments: WithPending<Payment>[];
  billingLastUpdated: string;
  hasFyData: boolean;
  isPWP: boolean;
  openReminderModal: (billing?: Billing) => void;
  openBillingModalForRecord: (billing?: Billing | null) => void;
  openBillingWorkspace: (billing: Billing) => void;
  deleteBilling: (billing: Billing) => void;
  openFYModal: () => void;
  openPaymentModalForRecord: (payment?: Payment | null) => void;
  deletePayment: (paymentId: string) => void;
  view?: "all" | "billing" | "payments" | "ledger";
};

export default function ClientProfileBillingPayments({
  selectedFy,
  billings,
  payments,
  billingLastUpdated,
  hasFyData,
  isPWP,
  openReminderModal,
  openBillingModalForRecord,
  openBillingWorkspace,
  deleteBilling,
  openFYModal,
  openPaymentModalForRecord,
  deletePayment,
  view = "all",
}: ClientProfileBillingPaymentsProps) {
  const showBilling = view === "all" || view === "billing";
  const showPayments = view === "all" || view === "payments";
  const showLedger = view === "ledger";
  const outstandingBilling = billings.find((record) => Number(record.pendingAmount || 0) > 0);
  const directPayments = payments.filter((payment) => payment.paymentType !== "advance");
  const advancePayments = payments.filter((payment) => payment.paymentType === "advance");
  const paymentTotal = directPayments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const advanceTotal = advancePayments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const ledgerEntries = [
    ...billings.map((record) => ({
      id: `billing-${record._id}`,
      date: record.billDate || record.invoiceDate || record.createdAt || "",
      title: record.billTitle || (record.invoiceNumber ? `Invoice ${record.invoiceNumber}` : "Annual Return Filing"),
      detail: (record.billType || "annual_return") === "general" ? "General bill" : "Annual Return bill",
      amount: Number(record.totalAmount || 0),
      kind: "debit" as const,
    })),
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
        <div>
          <p className="client-profile-kicker">Billing</p>
          <h3 className="text-xl font-semibold text-default">FY {selectedFy} bills</h3>
          {billings.length > 0 && <p className="mt-1 text-xs text-faint">{billings.length} bill{billings.length === 1 ? "" : "s"} recorded</p>}
        </div>
        <button type="button" className="glass-btn glass-btn-primary" onClick={() => openBillingModalForRecord()}>
          <Plus className="w-3.5 h-3.5" /> Create Billing
        </button>
      </div>
      {billingLastUpdated && <p className="text-xs text-faint mb-4">Last updated {formatDateTime(billingLastUpdated)}</p>}
      {billings.length > 0 ? (
        <div className="space-y-4">
          {billings.map((record) => {
            const isGeneral = (record.billType || "annual_return") === "general";
            const isPending = record._status === "pending";
            const progress = record.totalAmount
              ? Math.min(100, Math.round((Number(record.totalPaid || 0) / Number(record.totalAmount)) * 100))
              : 0;
            const billingDate = record.billDate || record.invoiceDate || record.createdAt;

            return (
              <article key={record._id} className={`rounded-2xl border border-base bg-card p-4 transition-opacity duration-200 sm:p-5 ${isPending ? "opacity-60" : ""}`}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-semibold text-default">{record.billTitle || (isGeneral ? "General Bill" : "Annual Return Filing")}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isGeneral ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"}`}>
                        {isGeneral ? "General" : "Annual Return"}
                      </span>
                      <PaymentStatusBadge status={record.paymentStatus} />
                      <PendingChip status={record._status} />
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      {billingDate ? formatDate(billingDate) : `FY ${selectedFy}`}
                    </p>
                  </div>
                  <div className="glass-tray self-start" style={{ gap: "3px" }}>
                    {record.pendingAmount > 0 && (
                      <button type="button" className="glass-pill" disabled={isPending} onClick={() => openReminderModal(record)}>
                        <Send className="w-3 h-3" /> Reminder
                      </button>
                    )}
                    <button type="button" className="glass-pill" disabled={isPending} onClick={() => isGeneral ? openBillingWorkspace(record) : openBillingModalForRecord(record)}>
                      <Pencil className="w-3 h-3" /> {isGeneral ? "Manage" : "Edit"}
                    </button>
                    <button type="button" className="glass-pill" style={{ color: "#ff3b30" }} disabled={isPending} onClick={() => deleteBilling(record)}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>

                <div className="client-profile-financial-payment-progress">
                  <div><span>Payment progress</span><strong>{progress}%</strong></div>
                  <div aria-label={`${progress}% paid`}><span style={{ width: `${progress}%` }} /></div>
                </div>

                {isGeneral ? (
                  <div className="mb-4 space-y-2">
                    {(record.lineItems || []).length > 0 ? record.lineItems?.map((item, index) => (
                      <div key={`${record._id}-item-${index}`} className="flex items-start justify-between gap-4 rounded-xl bg-surface px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-default">{item.description}</p>
                          <p className="text-xs text-faint">{item.quantity} × {formatCurrency(item.rate)} · GST {item.gstPercent}%</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-default">{formatCurrency(item.totalAmount)}</p>
                      </div>
                    )) : <div className="rounded-xl bg-surface px-3 py-2.5 text-sm text-muted">General billing entry</div>}
                  </div>
                ) : (
                  <>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-surface p-3"><p className="text-xs text-muted">Govt Charges</p><p className="font-semibold">{formatCurrency(record.govtCharges)}</p></div>
                      <div className="rounded-xl bg-surface p-3"><p className="text-xs text-muted">Consultancy</p><p className="font-semibold">{formatCurrency(record.consultancyCharges)}</p></div>
                      <div className="rounded-xl bg-surface p-3"><p className="text-xs text-muted">Target Charges</p><p className="font-semibold">{formatCurrency(record.targetCharges)}</p></div>
                      <div className="rounded-xl bg-surface p-3"><p className="text-xs text-muted">Other Charges</p><p className="font-semibold">{formatCurrency(record.otherCharges)}</p></div>
                    </div>
                    {(record.lineItems || []).length > 0 && (
                      <div className="mb-4 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Additional Items</p>
                        {record.lineItems?.map((item, index) => (
                          <div key={`${record._id}-additional-${index}`} className="flex items-start justify-between gap-4 rounded-xl bg-surface px-3 py-2.5">
                            <div className="min-w-0"><p className="truncate text-sm font-medium text-default">{item.description}</p><p className="text-xs text-faint">{item.quantity} × {formatCurrency(item.rate)} · GST {item.gstPercent}%</p></div>
                            <p className="shrink-0 text-sm font-semibold text-default">{formatCurrency(item.totalAmount)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {record.notes && <div className="mb-4 rounded-xl bg-surface px-3 py-2.5 text-sm text-muted">{record.notes}</div>}
                <div className="grid grid-cols-1 gap-3 border-t border-soft pt-3 sm:grid-cols-3">
                  <div className="text-center"><p className="text-xs text-muted">Total Billed</p><p className="font-bold text-default">{formatCurrency(record.totalAmount)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted">Paid</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(record.totalPaid)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted">Pending</p><p className="font-bold text-red-500">{formatCurrency(record.pendingAmount)}</p></div>
                </div>
              </article>
            );
          })}
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
              {outstandingBilling && (
                <button type="button" className="glass-pill" onClick={() => openReminderModal(outstandingBilling)}>
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
  billings,
  payments,
  acceptedQuotationCount,
  isPWP,
  onCreateBilling,
  onAddPayment,
  onSendReminder,
  onOpenSection,
}: {
  selectedFy: string;
  billings: WithPending<Billing>[];
  payments: WithPending<Payment>[];
  acceptedQuotationCount: number;
  isPWP: boolean;
  onCreateBilling: () => void;
  onAddPayment: () => void;
  onSendReminder: () => void;
  onOpenSection: (section: "quotations" | "billing" | "payments" | "ledger") => void;
}) {
  const total = billings.reduce((sum, record) => sum + Number(record.totalAmount || 0), 0);
  const paid = billings.reduce((sum, record) => sum + Number(record.totalPaid || 0), 0);
  const pending = billings.reduce((sum, record) => sum + Number(record.pendingAmount || 0), 0);
  const hasBilling = billings.length > 0;
  const advances = payments.filter((payment) => payment.paymentType === "advance")
    .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const progress = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const settled = hasBilling && pending <= 0;
  const paymentStatus = settled ? "Paid" : paid > 0 ? "Partial" : hasBilling ? "Unpaid" : "Not billed";

  return (
    <div className="client-profile-section-stack">
      <section className="client-profile-card client-profile-financial-overview">
        <div className="client-profile-card-header">
          <div>
            <p className="client-profile-kicker">Financial Overview</p>
            <h2>FY {selectedFy} at a glance</h2>
            <span>Billing, receipts and outstanding balance in one clear view.</span>
          </div>
          <span className="client-profile-status-pill" data-state={settled ? "complete" : hasBilling ? "progress" : "neutral"}>
            {settled ? "Settled" : paymentStatus}
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
            <strong>{settled ? "Account settled for this financial year" : !hasBilling ? "Create billing to begin payment tracking" : "Payment follow-up is required"}</strong>
            <small>{settled ? "All billed charges have been received." : !hasBilling ? "Once billing is created, receipts and outstanding balance update automatically." : `${formatCurrency(pending)} remains outstanding across ${billings.length} bill${billings.length === 1 ? "" : "s"}.`}</small>
          </div>
          <button type="button" className="client-profile-primary-button" onClick={!hasBilling ? onCreateBilling : settled ? onAddPayment : onSendReminder}>
            {!hasBilling ? "Create Billing" : settled ? "Add Payment" : "Send Reminder"}
          </button>
        </div>
      </section>

      <section className="client-profile-financial-shortcuts">
        {!isPWP && <button type="button" onClick={() => onOpenSection("quotations")}><Receipt className="h-4 w-4" /><span>Quotations<small>{acceptedQuotationCount} accepted</small></span></button>}
        <button type="button" onClick={() => onOpenSection("billing")}><IndianRupee className="h-4 w-4" /><span>Billing<small>{hasBilling ? `${billings.length} bill${billings.length === 1 ? "" : "s"}` : "Not created"}</small></span></button>
        <button type="button" onClick={() => onOpenSection("payments")}><Wallet className="h-4 w-4" /><span>Payments & Advances<small>{payments.length} entries</small></span></button>
        <button type="button" onClick={() => onOpenSection("ledger")}><Clock3 className="h-4 w-4" /><span>Ledger<small>View activity</small></span></button>
      </section>
    </div>
  );
}
