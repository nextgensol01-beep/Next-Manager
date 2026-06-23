"use client";
import React from "react";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { formatCurrency, formatDate, getPaymentPercentage } from "@/lib/utils";
import {
  Plus, Send, FileText, ChevronDown, ChevronUp, Trash2,
  CheckCircle2, AlertCircle,
  Wallet, Clock, ArrowLeftRight, Pencil, BookOpen, CreditCard,
} from "lucide-react";
import type { Billing, Payment, ViewMode } from "./types";
import { isAppliedAdvancePayment, statusBorderStyle } from "./helpers";

interface BillingListProps {
  billings: Billing[];
  filteredBillings: Billing[];
  payments: Payment[];
  loading: boolean;
  viewMode: ViewMode;
  expandedRows: Set<string>;
  paymentsByClient: Map<string, Payment[]>;
  advanceByClient: Map<string, number>;
  clientName: (id: string) => string;
  onToggleRow: (id: string) => void;
  onOpenPaymentModal: (billing: Billing) => void;
  onOpenApplyAdvanceModal: (billing: Billing) => void;
  onOpenLedgerModal: (clientId: string) => void;
  onOpenEmailModal: (billing: Billing) => void;
  onOpenInvoiceModal: (billing: Billing) => void;
  onOpenEditBillingModal: (billing: Billing) => void;
  onMarkInvoiceNotCreated: (billing: Billing) => void;
  onDeleteBilling: (id: string, clientId: string) => void;
  onDeletePayment: (id: string) => void;
}

export default function BillingList({
  billings,
  filteredBillings,
  loading,
  viewMode,
  expandedRows,
  paymentsByClient,
  advanceByClient,
  clientName,
  onToggleRow,
  onOpenPaymentModal,
  onOpenApplyAdvanceModal,
  onOpenLedgerModal,
  onOpenEmailModal,
  onOpenInvoiceModal,
  onOpenEditBillingModal,
  onMarkInvoiceNotCreated,
  onDeleteBilling,
  onDeletePayment,
}: BillingListProps) {
  if (loading) return null; // skeleton rendered by caller

  if (billings.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
        <EmptyState message="No billing records for this FY" description="Add billing for a client to get started" />
      </div>
    );
  }

  if (filteredBillings.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
        <EmptyState message="No matching billing records" description="Try a different search or filter" />
      </div>
    );
  }

  // ── TABLE VIEW ────────────────────────────────────────────────────────────
  if (viewMode === "table") {
    return (
      <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
        {/* Desktop table — hidden on mobile */}
        <div className="hidden sm:block">
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
                    <tr
                      key={billing._id}
                      className="hover:bg-surface border-l-2 transition-colors"
                      style={{ borderLeftColor: isPaid ? "#34d399" : isOverdue ? "#f87171" : isPartial ? "#fbbf24" : "#f87171" }}
                    >
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
                          <button type="button" onClick={() => onMarkInvoiceNotCreated(billing)} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-3 h-3" />
                            {billing.invoiceNumber ? billing.invoiceNumber : "Created"}
                          </button>
                        ) : (
                          <button type="button" onClick={() => onOpenInvoiceModal(billing)} className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/25 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 transition-colors">
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
                          <button onClick={() => onOpenPaymentModal(billing)} className="p-1 text-faint hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Add payment"><CreditCard className="w-3.5 h-3.5" /></button>
                          {advance > 0 && billing.pendingAmount > 0 && (
                            <button onClick={() => onOpenApplyAdvanceModal(billing)} className="p-1 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Apply advance"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => onOpenLedgerModal(billing.clientId)} className="p-1 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Ledger"><BookOpen className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onOpenEditBillingModal(billing)} className="p-1 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onDeleteBilling(billing._id, billing.clientId)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        </div>

        {/* Mobile table view — compact cards instead of wide table */}
        <div className="sm:hidden divide-y divide-soft">
          {filteredBillings.map((billing) => {
            const advance = advanceByClient.get(billing.clientId) || 0;
            const isOverdue = (billing.daysOverdue ?? 0) > 0;
            const isPaid = billing.pendingAmount <= 0 || billing.paymentStatus.toLowerCase() === "paid";
            const isPartial = billing.pendingAmount > 0 && billing.totalPaid > 0;
            const accentColor = isPaid ? "#34d399" : isOverdue ? "#f87171" : isPartial ? "#fbbf24" : "#f87171";
            return (
              <div key={billing._id} className="p-3.5 border-l-2" style={{ borderLeftColor: accentColor }}>
                {/* Row 1: Client name + actions */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-default text-sm truncate">{clientName(billing.clientId)}</p>
                    <p className="text-[11px] text-faint">{billing.clientId} · FY {billing.financialYear}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => onOpenPaymentModal(billing)} className="p-1.5 text-faint hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Add payment"><CreditCard className="w-4 h-4" /></button>
                    <button onClick={() => onOpenEditBillingModal(billing)} className="p-1.5 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => onDeleteBilling(billing._id, billing.clientId)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {/* Row 2: Amount grid */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="bg-surface rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-faint">Billed</p>
                    <p className="text-xs font-semibold text-default">{formatCurrency(billing.totalAmount)}</p>
                  </div>
                  <div className="bg-surface rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-faint">Paid</p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(billing.totalPaid)}</p>
                  </div>
                  <div className="bg-surface rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-faint">Pending</p>
                    <p className="text-xs font-bold text-red-500 dark:text-red-400">{billing.pendingAmount > 0 ? formatCurrency(billing.pendingAmount) : "—"}</p>
                  </div>
                </div>
                {/* Row 3: Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <PaymentStatusBadge status={billing.paymentStatus} />
                  {billing.invoiceCreated ? (
                    <button type="button" onClick={() => onMarkInvoiceNotCreated(billing)} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3 h-3" /> Invoice ✓
                    </button>
                  ) : (
                    <button type="button" onClick={() => onOpenInvoiceModal(billing)} className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/25 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                      <AlertCircle className="w-3 h-3" /> No Invoice
                    </button>
                  )}
                  {isOverdue && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/25 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                      <Clock className="w-2.5 h-2.5" /> {billing.daysOverdue}d overdue
                    </span>
                  )}
                  {advance > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <Wallet className="w-3 h-3" /> {formatCurrency(advance)}
                    </span>
                  )}
                </div>
                {/* Extra actions row */}
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => onOpenLedgerModal(billing.clientId)} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-base bg-surface py-1.5 text-xs font-medium text-muted transition-colors active:opacity-80"><BookOpen className="w-3.5 h-3.5" /> Ledger</button>
                  {advance > 0 && billing.pendingAmount > 0 && (
                    <button onClick={() => onOpenApplyAdvanceModal(billing)} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors active:opacity-80"><ArrowLeftRight className="w-3.5 h-3.5" /> Apply Advance</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-soft flex items-center justify-between text-xs text-faint">
          <span>Showing {filteredBillings.length} of {billings.length} records</span>
          <span className="font-medium text-default">{formatCurrency(filteredBillings.reduce((s, b) => s + b.totalAmount, 0))} total billed</span>
        </div>
      </div>
    );
  }

  // ── CARD VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {filteredBillings.map((billing) => {
        const expanded = expandedRows.has(billing._id);
        const cPayments = paymentsByClient.get(billing.clientId) ?? [];
        const pct = getPaymentPercentage(billing.totalPaid, billing.totalAmount);
        const targetBreakdown = billing.targetBreakdown || [];
        const hasTargetBreakdown = targetBreakdown.length > 0;
        const targetBreakdownTotal = targetBreakdown.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
        const advance = advanceByClient.get(billing.clientId) || 0;
        const isPaid = billing.pendingAmount <= 0 || billing.paymentStatus.toLowerCase() === "paid";
        const isOverdue = (billing.daysOverdue ?? 0) > 0;

        return (
          <div key={billing._id} className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden" style={statusBorderStyle(billing)}>
            <div className="p-3.5 sm:p-5">
              {/* Card header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-default truncate">{clientName(billing.clientId)}</h3>
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
                {/* Desktop: all badges + edit/delete inline */}
                <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
                  {isOverdue && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/25 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                      <Clock className="w-2.5 h-2.5" /> Overdue
                    </span>
                  )}
                  <PaymentStatusBadge status={billing.paymentStatus} />
                  {billing.invoiceCreated ? (
                    <button type="button" onClick={() => onMarkInvoiceNotCreated(billing)} title="Invoice created — click to revert" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                      <CheckCircle2 className="w-3 h-3" /> Invoice Created
                    </button>
                  ) : (
                    <button type="button" onClick={() => onOpenInvoiceModal(billing)} title="Invoice not yet created — click to mark" className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/25 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors">
                      <AlertCircle className="w-3 h-3" /> Invoice Pending
                    </button>
                  )}
                  <button onClick={() => onOpenEditBillingModal(billing)} className="p-1.5 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit billing"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteBilling(billing._id, billing.clientId)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete billing"><Trash2 className="w-4 h-4" /></button>
                </div>
                {/* Mobile: just edit/delete icons */}
                <div className="flex sm:hidden items-center gap-1 flex-shrink-0">
                  <button onClick={() => onOpenEditBillingModal(billing)} className="p-1.5 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit billing"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteBilling(billing._id, billing.clientId)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete billing"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Mobile badges row */}
              <div className="flex sm:hidden items-center gap-1.5 flex-wrap mb-3">
                {isOverdue && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/25 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                    <Clock className="w-2.5 h-2.5" /> Overdue
                  </span>
                )}
                <PaymentStatusBadge status={billing.paymentStatus} />
                {billing.invoiceCreated ? (
                  <button type="button" onClick={() => onMarkInvoiceNotCreated(billing)} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" /> Invoice ✓
                  </button>
                ) : (
                  <button type="button" onClick={() => onOpenInvoiceModal(billing)} className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/25 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                    <AlertCircle className="w-3 h-3" /> No Invoice
                  </button>
                )}
              </div>

              {/* Notes */}
              {billing.notes && (
                <div className="mb-3 rounded-lg border border-base bg-surface px-3 py-2">
                  <p className="text-xs font-medium text-faint">Billing note</p>
                  <p className="mt-0.5 text-xs text-muted">{billing.notes}</p>
                </div>
              )}

              {/* Invoice info strip */}
              {billing.invoiceCreated && (billing.invoiceNumber || billing.invoiceDate || billing.invoiceAmount != null) && (
                <div className="mb-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 flex flex-wrap items-center gap-3">
                  {billing.invoiceNumber && <div><p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Invoice No.</p><p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{billing.invoiceNumber}</p></div>}
                  {billing.invoiceDate && <div><p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Date</p><p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{formatDate(billing.invoiceDate)}</p></div>}
                  {billing.invoiceAmount != null && <div><p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Amount</p><p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{formatCurrency(billing.invoiceAmount)}</p></div>}
                  <button type="button" onClick={() => onOpenInvoiceModal(billing)} className="text-xs text-emerald-600 dark:text-emerald-400 underline underline-offset-2 ml-auto">Edit</button>
                </div>
              )}

              {/* Charge breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {[
                  { label: "Govt", value: billing.govtCharges },
                  { label: "Consultancy", value: billing.consultancyCharges },
                  { label: "Target", value: billing.targetCharges, extra: hasTargetBreakdown },
                  { label: "Other", value: billing.otherCharges },
                ].map((item) => (
                  <div key={item.label} className="bg-surface rounded-lg px-2.5 py-2">
                    <p className="text-[10px] font-medium text-faint uppercase tracking-wide">{item.label}</p>
                    <p className="font-semibold text-sm text-default mt-0.5">{formatCurrency(item.value)}</p>
                    {item.extra && (
                      <button type="button" onClick={() => onToggleRow(billing._id)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-300">
                        GST incl. {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mb-3">
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
                {advance > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 mb-3">
                    <Wallet className="w-3 h-3" /> {formatCurrency(advance)} advance available
                  </p>
                )}
              </div>

              {/* Action tray — mobile */}
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                <button className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 dark:bg-brand-900/30 dark:border-brand-800 px-3 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300 transition-colors active:opacity-80" onClick={() => onOpenPaymentModal(billing)}>
                  <Plus className="w-3.5 h-3.5" /> Add Payment
                </button>
                <button className="flex items-center justify-center gap-1.5 rounded-xl border border-base bg-surface px-3 py-2 text-xs font-semibold text-muted transition-colors active:opacity-80" onClick={() => onOpenEmailModal(billing)}>
                  <Send className="w-3.5 h-3.5" /> Reminder
                </button>
                <button className="flex items-center justify-center gap-1.5 rounded-xl border border-base bg-surface px-3 py-2 text-xs font-semibold text-muted transition-colors active:opacity-80" onClick={() => onOpenLedgerModal(billing.clientId)}>
                  <BookOpen className="w-3.5 h-3.5" /> Ledger
                </button>
                <button className="flex items-center justify-center gap-1.5 rounded-xl border border-base bg-surface px-3 py-2 text-xs font-semibold text-muted transition-colors active:opacity-80" onClick={() => onToggleRow(billing._id)}>
                  <FileText className="w-3.5 h-3.5" /> {hasTargetBreakdown ? "Details" : "Payments"} {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {advance > 0 && billing.pendingAmount > 0 && (
                  <button className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 transition-colors active:opacity-80" onClick={() => onOpenApplyAdvanceModal(billing)}>
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Apply Advance
                  </button>
                )}
              </div>
              {/* Action tray — desktop */}
              <div className="glass-tray !hidden sm:!inline-flex" style={{ flexWrap: "wrap" }}>
                <button className="glass-pill glass-pill-active" onClick={() => onOpenPaymentModal(billing)}><Plus className="w-3.5 h-3.5" /> Add Payment</button>
                {advance > 0 && billing.pendingAmount > 0 && (
                  <button className="glass-pill" style={{ color: "var(--color-amber-600, #d97706)" }} onClick={() => onOpenApplyAdvanceModal(billing)} title={`₹${advance.toLocaleString("en-IN")} available`}>
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Apply Advance
                  </button>
                )}
                <button className="glass-pill" onClick={() => onOpenLedgerModal(billing.clientId)}><BookOpen className="w-3.5 h-3.5" /> Ledger</button>
                <button className="glass-pill" onClick={() => onOpenEmailModal(billing)}><Send className="w-3.5 h-3.5" /> Send Reminder</button>
                <button className="glass-pill" onClick={() => onToggleRow(billing._id)}>
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
                    {/* Desktop: scrollable table */}
                    <div className="hidden sm:block">
                      <TableWrapper>
                        <table className="w-full min-w-[720px]">
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
                        </table>
                      </TableWrapper>
                    </div>
                    {/* Mobile: stacked cards */}
                    <div className="sm:hidden space-y-2">
                      {targetBreakdown.map((row, idx) => (
                        <div key={`${billing._id}-${row.categoryId}-${row.type}-${idx}`} className="rounded-xl border border-base bg-card p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-xs font-semibold text-default">{row.categoryLabel}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="bg-surface text-muted text-[10px] px-1.5 py-0.5 rounded">{row.type === "EOL" ? "EOL" : "Recycling"}</span>
                                {row.rateSource === "transaction" && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">from credits</span>}
                              </div>
                            </div>
                            <p className="text-sm font-bold text-default flex-shrink-0">{formatCurrency(row.totalAmount)}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-surface rounded-lg px-2 py-1.5">
                              <p className="text-[10px] text-faint">Target Qty</p>
                              <p className="text-xs font-medium text-default">{Number(row.quantity || 0).toLocaleString("en-IN")}</p>
                            </div>
                            <div className="bg-surface rounded-lg px-2 py-1.5">
                              <p className="text-[10px] text-faint">Rate</p>
                              <p className="text-xs font-medium text-default">{formatCurrency(row.rate)}</p>
                            </div>
                            <div className="bg-surface rounded-lg px-2 py-1.5">
                              <p className="text-[10px] text-faint">Taxable</p>
                              <p className="text-xs font-medium text-default">{formatCurrency(row.taxableAmount)}</p>
                            </div>
                            <div className="bg-surface rounded-lg px-2 py-1.5">
                              <p className="text-[10px] text-faint">GST {Number(row.gstPercent || 0)}%</p>
                              <p className="text-xs font-medium text-default">{formatCurrency(row.gstAmount)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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
                  <>
                    {/* Desktop payment table */}
                    <div className="hidden sm:block">
                      <TableWrapper>
                        <table className="w-full min-w-[720px]">
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
                                    : <button onClick={() => onDeletePayment(p._id)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete payment"><Trash2 className="w-3.5 h-3.5" /></button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableWrapper>
                    </div>
                    {/* Mobile payment cards */}
                    <div className="sm:hidden space-y-2 p-3">
                      {cPayments.map((p) => (
                        <div key={p._id} className="rounded-xl border border-base bg-card p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</p>
                              <p className="text-[11px] text-faint mt-0.5">{formatDate(p.paymentDate)}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isAppliedAdvancePayment(p)
                                ? <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300 text-[10px] px-2 py-0.5 border border-amber-200 dark:border-amber-800">Applied advance</span>
                                : <span className="rounded-full bg-surface text-muted text-[10px] px-2 py-0.5 border border-base">Direct</span>}
                              {isAppliedAdvancePayment(p)
                                ? <span className="text-[11px] text-faint">Locked</span>
                                : <button onClick={() => onDeletePayment(p._id)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete payment"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-surface text-muted text-[10px] px-2 py-0.5 rounded border border-base">{p.paymentMode}</span>
                            {p.referenceNumber && <span className="text-[10px] text-faint">Ref: {p.referenceNumber}</span>}
                            {p.notes && <span className="text-[10px] text-faint truncate">{p.notes}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
