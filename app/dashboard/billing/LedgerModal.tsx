"use client";

import Modal from "@/components/ui/Modal";
import TableWrapper from "@/components/ui/TableWrapper";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Billing, Payment } from "./types";
import { isAppliedAdvancePayment } from "./helpers";

interface LedgerModalProps {
  clientId: string | null;
  billings: Billing[];
  payments: Payment[];
  advanceBalance: number;
  clientName: (clientId: string) => string;
  onClose: () => void;
  fy: string;
}

export default function LedgerModal({ clientId, billings, payments, advanceBalance, clientName, onClose, fy }: LedgerModalProps) {
  const clientBillings = clientId ? billings.filter((billing) => billing.clientId === clientId) : [];
  const clientPayments = clientId ? payments.filter((payment) => payment.clientId === clientId) : [];
  const directPay = clientPayments.filter((payment) => payment.paymentType !== "advance" && !isAppliedAdvancePayment(payment));
  const appliedAdv = clientPayments.filter((payment) => payment.paymentType !== "advance" && isAppliedAdvancePayment(payment));
  const totalBilled = clientBillings.reduce((sum, billing) => sum + Number(billing.totalAmount || 0), 0);
  const totalDirect = directPay.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const totalApplied = appliedAdv.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const pending = clientBillings.reduce((sum, billing) => sum + Number(billing.pendingAmount || 0), 0);

  return (
    <Modal open={Boolean(clientId)} onClose={onClose} title="Client Ledger" size="lg">
      {clientId && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-default">{clientName(clientId)}</h3>
            <p className="text-sm text-faint">{clientId} · FY {fy}</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Billed", value: formatCurrency(totalBilled), color: "text-default" },
              { label: "Direct Paid", value: formatCurrency(totalDirect), color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Applied Advance", value: formatCurrency(totalApplied), color: "text-amber-600 dark:text-amber-400" },
              { label: "Pending", value: formatCurrency(pending), color: pending > 0 ? "text-red-500" : "text-default" },
              { label: "Advance Balance", value: formatCurrency(advanceBalance), color: "text-default" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-base bg-surface p-3">
                <p className="text-xs text-faint">{item.label}</p>
                <p className={`font-bold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold text-default mb-2">Billing Records</p>
            {clientBillings.length === 0 ? (
              <p className="text-sm text-faint rounded-xl border border-base bg-surface p-4">No billing records for this FY.</p>
            ) : (
              <div className="space-y-2">
                {clientBillings.map((billing) => (
                  <div key={billing._id} className="rounded-xl border border-base bg-surface p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-default">{formatCurrency(billing.totalAmount)}</p>
                        <p className="text-xs text-faint">Paid {formatCurrency(billing.totalPaid)} · Pending {formatCurrency(billing.pendingAmount)}{billing.dueDate ? ` · Due ${formatDate(billing.dueDate)}` : ""}</p>
                      </div>
                      <PaymentStatusBadge status={billing.paymentStatus} />
                    </div>
                    {billing.notes && <p className="mt-2 text-xs text-muted">{billing.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-default mb-2">All Payments</p>
            {clientPayments.length === 0 ? (
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
                  {clientPayments.map((payment) => (
                    <tr key={payment._id} className="hover:bg-surface">
                      <td className="table-cell whitespace-nowrap">{formatDate(payment.paymentDate)}</td>
                      <td className="table-cell font-semibold">{formatCurrency(payment.amountPaid)}</td>
                      <td className="table-cell whitespace-nowrap">{payment.paymentType === "advance" ? "Advance balance" : isAppliedAdvancePayment(payment) ? "Applied advance" : "Direct payment"}</td>
                      <td className="table-cell whitespace-nowrap">{payment.paymentMode}</td>
                      <td className="table-cell text-faint text-xs">{payment.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></TableWrapper>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
