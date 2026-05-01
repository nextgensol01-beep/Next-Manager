"use client";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { formatDateTime, type Billing, type Payment } from "./ClientProfileSupport";

type ClientProfileBillingPaymentsProps = {
  selectedFy: string;
  billing: Billing | null;
  payments: Payment[];
  billingLastUpdated: string;
  busyAction: string | null;
  hasFyData: boolean;
  isPWP: boolean;
  openReminderModal: (billing?: Billing) => void;
  openBillingModalForRecord: (billing?: Billing | null) => void;
  deleteBilling: (billing: Billing) => void;
  openFYModal: () => void;
  openPaymentModalForRecord: (payment?: Payment | null) => void;
  deletePayment: (paymentId: string) => void;
};

export default function ClientProfileBillingPayments({
  selectedFy,
  billing,
  payments,
  billingLastUpdated,
  busyAction,
  hasFyData,
  isPWP,
  openReminderModal,
  openBillingModalForRecord,
  deleteBilling,
  openFYModal,
  openPaymentModalForRecord,
  deletePayment,
}: ClientProfileBillingPaymentsProps) {
  return (
    <>
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-default">Billing - FY {selectedFy}</h3>
          {billing && <PaymentStatusBadge status={billing.paymentStatus} />}
        </div>
        <div className="flex items-center gap-2">
          {billing ? (
            <div className="glass-tray" style={{ gap: "3px" }}>
              {billing.pendingAmount > 0 && (
                <button type="button" className="glass-pill" onClick={() => openReminderModal(billing)}>
                  <Send className="w-3 h-3" /> Reminder
                </button>
              )}
              <button type="button" className="glass-pill" onClick={() => openBillingModalForRecord(billing)}>
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button type="button" className="glass-pill" style={{ color: "#ff3b30" }} disabled={busyAction === `billing-${billing._id}`} onClick={() => deleteBilling(billing)}>
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
        <>
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
        </>
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
    </div>
    
    <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
      <div className="p-4 border-b border-base flex items-center justify-between gap-3">
        <h3 className="font-semibold text-default">Payment History - FY {selectedFy}</h3>
        <button type="button" className="glass-btn glass-btn-primary" onClick={() => openPaymentModalForRecord()}>
          <Plus className="w-3.5 h-3.5" /> Add Payment
        </button>
      </div>
      {payments.length > 0 ? (
        <table className="w-full min-w-[400px]">
          <thead><tr><th className="table-header">Date</th><th className="table-header">Amount</th><th className="table-header">Type</th><th className="table-header">Mode</th><th className="table-header">Reference</th><th className="table-header">Actions</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p._id} className="hover:bg-surface border-t border-soft">
                <td className="table-cell">{formatDate(p.paymentDate)}</td>
                <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</td>
                <td className="table-cell">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentType === "advance" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                    {p.paymentType === "advance" ? "Advance" : "Billing"}
                  </span>
                </td>
                <td className="table-cell">{p.paymentMode}</td>
                <td className="table-cell text-faint">{p.referenceNumber || "-"}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openPaymentModalForRecord(p)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" disabled={busyAction === `payment-${p._id}`} onClick={() => deletePayment(p._id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-60">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
    </>
  );
}
