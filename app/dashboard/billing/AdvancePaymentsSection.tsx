import React from "react";
import { ArrowLeftRight, BookOpen, ChevronDown, ChevronUp, Plus, Search, Trash2, Wallet, X } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import TableWrapper from "@/components/ui/TableWrapper";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AdvanceClientRow, Billing, BillingSummary } from "./types";

interface AdvancePaymentsSectionProps {
  fy: string;
  billingSummary: BillingSummary;
  appliedAdvanceTotal: number;
  advanceClientRows: AdvanceClientRow[];
  filteredAdvanceClientRows: AdvanceClientRow[];
  expandedAdvanceClients: Set<string>;
  search: string;
  onSearchChange: (value: string) => void;
  onRecordAdvance: () => void;
  onApplyAdvance: (billing: Billing) => void;
  onOpenLedger: (clientId: string) => void;
  onToggleClient: (clientId: string) => void;
  onDeletePayment: (paymentId: string) => void;
}

export default function AdvancePaymentsSection({
  fy,
  billingSummary,
  appliedAdvanceTotal,
  advanceClientRows,
  filteredAdvanceClientRows,
  expandedAdvanceClients,
  search,
  onSearchChange,
  onRecordAdvance,
  onApplyAdvance,
  onOpenLedger,
  onToggleClient,
  onDeletePayment,
}: AdvancePaymentsSectionProps) {
  return (
    <div className="space-y-3">
      {/* Header card */}
      <div className="bg-card border border-base rounded-2xl p-3.5 sm:p-4 shadow-sm">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-semibold text-default">Advance Payments</h2>
            <p className="text-xs text-faint mt-0.5 hidden sm:block">Client-level balances, available advance, and applied history for FY {fy}.</p>
            <p className="text-xs text-faint mt-0.5 sm:hidden">FY {fy}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-xl border border-base bg-surface px-2.5 py-2">
            <p className="text-[10px] text-faint">Available</p>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 truncate">{formatCurrency(billingSummary.totalAdvance)}</p>
          </div>
          <div className="rounded-xl border border-base bg-surface px-2.5 py-2">
            <p className="text-[10px] text-faint">Applied FY</p>
            <p className="text-sm font-bold text-default truncate">{formatCurrency(appliedAdvanceTotal)}</p>
          </div>
          <div className="rounded-xl border border-base bg-surface px-2.5 py-2">
            <p className="text-[10px] text-faint">Clients</p>
            <p className="text-sm font-bold text-default">{advanceClientRows.length}</p>
          </div>
        </div>

        {/* Search + action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 rounded-xl border border-base bg-surface px-3 py-2">
            <Search className="w-4 h-4 text-faint flex-shrink-0" />
            <input
              className="bg-transparent border-0 ring-0 outline-none flex-1 text-sm text-default placeholder:text-faint min-w-0"
              placeholder="Search advances..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {search && <button type="button" onClick={() => onSearchChange("")} className="p-1 text-faint hover:text-default rounded transition-colors"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <button type="button" className="flex items-center gap-1.5 rounded-xl border border-base bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-xs font-semibold transition-colors flex-shrink-0" onClick={onRecordAdvance}>
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Record Advance</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {filteredAdvanceClientRows.length === 0 ? (
        <div className="bg-card rounded-2xl p-8 shadow-sm border border-base">
          <EmptyState message="No advance payments found" description={search ? "Try a different search" : "Record an advance payment to track available client funds"} />
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden sm:block bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
            <TableWrapper>
              <table className="w-full min-w-[1060px] table-fixed">
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="table-header">Client</th>
                    <th className="table-header !text-right">Available Balance</th>
                    <th className="table-header !text-right">Applied History</th>
                    <th className="table-header !pl-8">Last Advance</th>
                    <th className="table-header !pl-8">Pending Billing</th>
                    <th className="table-header !text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdvanceClientRows.map((row) => {
                    const expanded = expandedAdvanceClients.has(row.clientId);
                    const pendingBilling = row.pendingBillings[0];
                    return (
                      <React.Fragment key={row.clientId}>
                        <tr className="hover:bg-surface">
                          <td className="table-cell">
                            <p className="font-medium text-default truncate" title={row.clientName}>{row.clientName}</p>
                            <p className="text-xs text-faint">{row.clientId} - {row.advances.length} advance record{row.advances.length !== 1 ? "s" : ""}</p>
                          </td>
                          <td className="table-cell text-right whitespace-nowrap">
                            {row.available > 0 ? (
                              <span className="inline-flex items-center gap-1 justify-end font-semibold text-amber-600 dark:text-amber-400">
                                <Wallet className="w-3.5 h-3.5" /> {formatCurrency(row.available)}
                              </span>
                            ) : (
                              <span className="text-faint">-</span>
                            )}
                          </td>
                          <td className="table-cell text-right whitespace-nowrap font-semibold text-default">{formatCurrency(row.applied)}</td>
                          <td className="table-cell !pl-8 whitespace-nowrap text-sm text-muted">{row.lastAdvanceDate ? formatDate(row.lastAdvanceDate) : "-"}</td>
                          <td className="table-cell !pl-8 whitespace-nowrap">
                            {pendingBilling ? (
                              <span className="text-xs font-medium text-red-500">{formatCurrency(pendingBilling.pendingAmount)} pending</span>
                            ) : (
                              <span className="text-xs text-faint">No pending bill</span>
                            )}
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            <div className="flex items-center gap-1 justify-end">
                              {row.available > 0 && pendingBilling && (
                                <button type="button" onClick={() => onApplyAdvance(pendingBilling)} className="p-1 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Apply advance to billing">
                                  <ArrowLeftRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button type="button" onClick={() => onOpenLedger(row.clientId)} className="p-1 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Open ledger"><BookOpen className="w-3.5 h-3.5" /></button>
                              <button type="button" onClick={() => onToggleClient(row.clientId)} className="p-1 text-faint hover:text-default hover:bg-surface rounded-lg transition-colors" title={expanded ? "Hide history" : "Show history"}>
                                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6} className="p-0 bg-surface/40">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 border-t border-soft">
                                <section className="rounded-2xl border border-base bg-card p-4">
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className="text-sm font-semibold text-default">Advance Records</p>
                                    <p className="text-xs text-faint">{row.advances.length} record{row.advances.length !== 1 ? "s" : ""}</p>
                                  </div>
                                  {row.advances.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-base bg-surface px-4 py-5 text-center text-sm text-faint">No available advance balance.</p>
                                  ) : (
                                    <TableWrapper><table className="w-full min-w-[560px]">
                                      <thead><tr>
                                        <th className="table-header">Date</th>
                                        <th className="table-header">Amount</th>
                                        <th className="table-header">Mode</th>
                                        <th className="table-header">Reference</th>
                                        <th className="table-header">Notes</th>
                                        <th className="table-header"></th>
                                      </tr></thead>
                                      <tbody>
                                        {row.advances.map((p) => (
                                          <tr key={p._id} className="hover:bg-surface">
                                            <td className="table-cell whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                                            <td className="table-cell whitespace-nowrap font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(p.amountPaid)}</td>
                                            <td className="table-cell whitespace-nowrap"><span className="bg-surface text-muted text-xs px-2 py-0.5 rounded">{p.paymentMode}</span></td>
                                            <td className="table-cell text-faint">{p.referenceNumber || "-"}</td>
                                            <td className="table-cell text-faint text-xs">{p.notes || "-"}</td>
                                            <td className="table-cell whitespace-nowrap">
                                              <button type="button" onClick={() => onDeletePayment(p._id)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete advance"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table></TableWrapper>
                                  )}
                                </section>
                                <section className="rounded-2xl border border-base bg-card p-4">
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className="text-sm font-semibold text-default">Applied History</p>
                                    <p className="text-xs text-faint">{row.appliedPayments.length} application{row.appliedPayments.length !== 1 ? "s" : ""}</p>
                                  </div>
                                  {row.appliedPayments.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-base bg-surface px-4 py-5 text-center text-sm text-faint">No advance has been applied yet.</p>
                                  ) : (
                                    <TableWrapper><table className="w-full min-w-[480px]">
                                      <thead><tr>
                                        <th className="table-header">Applied Date</th>
                                        <th className="table-header">Amount</th>
                                        <th className="table-header">Notes</th>
                                        <th className="table-header">Status</th>
                                      </tr></thead>
                                      <tbody>
                                        {row.appliedPayments.map((p) => (
                                          <tr key={p._id} className="hover:bg-surface">
                                            <td className="table-cell whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                                            <td className="table-cell whitespace-nowrap font-semibold text-emerald-600">{formatCurrency(p.amountPaid)}</td>
                                            <td className="table-cell text-faint text-xs">{p.notes || "Applied from advance"}</td>
                                            <td className="table-cell whitespace-nowrap"><span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300 text-xs px-2 py-0.5 border border-amber-200 dark:border-amber-800">Locked</span></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table></TableWrapper>
                                  )}
                                </section>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-2.5">
            {filteredAdvanceClientRows.map((row) => {
              const expanded = expandedAdvanceClients.has(row.clientId);
              const pendingBilling = row.pendingBillings[0];
              return (
                <div key={row.clientId} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-3.5">
                    {/* Client header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-default truncate">{row.clientName}</p>
                        <p className="text-xs text-faint mt-0.5">{row.clientId} · {row.advances.length} advance{row.advances.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {row.available > 0 && pendingBilling && (
                          <button type="button" onClick={() => onApplyAdvance(pendingBilling)} className="p-1.5 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Apply advance">
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        )}
                        <button type="button" onClick={() => onOpenLedger(row.clientId)} className="p-1.5 text-faint hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><BookOpen className="w-4 h-4" /></button>
                        <button type="button" onClick={() => onToggleClient(row.clientId)} className="p-1.5 text-faint hover:text-default hover:bg-surface rounded-lg transition-colors">
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Balance stats */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-surface border border-base px-2.5 py-2">
                        <p className="text-[10px] text-faint">Available</p>
                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400 truncate">{formatCurrency(row.available)}</p>
                      </div>
                      <div className="rounded-lg bg-surface border border-base px-2.5 py-2">
                        <p className="text-[10px] text-faint">Applied</p>
                        <p className="text-sm font-bold text-default truncate">{formatCurrency(row.applied)}</p>
                      </div>
                      <div className="rounded-lg bg-surface border border-base px-2.5 py-2">
                        <p className="text-[10px] text-faint">Pending</p>
                        <p className={`text-sm font-bold truncate ${pendingBilling ? "text-red-500" : "text-faint"}`}>
                          {pendingBilling ? formatCurrency(pendingBilling.pendingAmount) : "—"}
                        </p>
                      </div>
                    </div>

                    {row.lastAdvanceDate && (
                      <p className="text-xs text-faint mt-2">Last advance: {formatDate(row.lastAdvanceDate)}</p>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="border-t border-soft bg-surface/30 p-3.5 space-y-3">
                      {/* Advance records */}
                      <div>
                        <p className="text-xs font-semibold text-default mb-2">Advance Records</p>
                        {row.advances.length === 0 ? (
                          <p className="text-xs text-faint text-center py-3 rounded-lg border border-dashed border-base bg-surface">No available advance balance.</p>
                        ) : (
                          <div className="space-y-2">
                            {row.advances.map((p) => (
                              <div key={p._id} className="flex items-center justify-between gap-2 rounded-lg border border-base bg-card px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(p.amountPaid)}</p>
                                  <p className="text-xs text-faint">{formatDate(p.paymentDate)} · {p.paymentMode}</p>
                                  {p.referenceNumber && <p className="text-xs text-faint">Ref: {p.referenceNumber}</p>}
                                </div>
                                <button type="button" onClick={() => onDeletePayment(p._id)} className="p-1 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Applied history */}
                      {row.appliedPayments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-default mb-2">Applied History</p>
                          <div className="space-y-2">
                            {row.appliedPayments.map((p) => (
                              <div key={p._id} className="flex items-center justify-between gap-2 rounded-lg border border-base bg-card px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-emerald-600">{formatCurrency(p.amountPaid)}</p>
                                  <p className="text-xs text-faint">{formatDate(p.paymentDate)}</p>
                                  {p.notes && <p className="text-xs text-faint">{p.notes}</p>}
                                </div>
                                <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300 text-[10px] px-2 py-0.5 border border-amber-200 dark:border-amber-800 flex-shrink-0">Locked</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
