import type { CSSProperties } from "react";
import type {
  Billing,
  BillingTargetBreakdown,
  ClientContact,
  CreditTransaction,
  CreditType,
  EmailOption,
  FinancialYearRecord,
  TargetBillingRow,
  TargetEntry,
  Payment,
} from "./types";

export const PIBO_CATEGORIES = new Set(["Producer", "Importer", "Brand Owner"]);
export const CATEGORY_LABELS: Record<string, string> = {
  "1": "Category I", "2": "Category II", "3": "Category III", "4": "Category IV",
};

export function normalizeCreditType(value: unknown): CreditType {
  return String(value).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

export function targetEntriesFromRecord(record?: FinancialYearRecord | null): TargetEntry[] {
  if (!record) return [];
  if (Array.isArray(record.targets) && record.targets.length > 0) {
    return record.targets
      .map((t) => ({ categoryId: String(t.categoryId), type: normalizeCreditType(t.type), value: Number(t.value || 0) }))
      .filter((t) => t.value > 0);
  }
  return [1, 2, 3, 4]
    .map((id) => ({
      categoryId: String(id), type: "RECYCLING" as CreditType,
      value: Number(record[`cat${id}Target` as keyof FinancialYearRecord] ?? record[`targetCat${id}` as keyof FinancialYearRecord] ?? 0),
    }))
    .filter((t) => t.value > 0);
}

export function rateForTarget(transactions: CreditTransaction[], target: TargetEntry) {
  const rateField = `rateCat${target.categoryId}` as keyof CreditTransaction;
  const match = transactions.find((tx) => normalizeCreditType(tx.creditType) === target.type && Number(tx[rateField] || tx.rate || 0) > 0);
  return Number(match?.[rateField] || match?.rate || 0);
}

export function targetRowsToBreakdown(rows: TargetBillingRow[]): BillingTargetBreakdown[] {
  return rows.filter((r) => r.include).map((r) => {
    const quantity = Number(r.quantity || 0);
    const rate = Number(r.rate || 0);
    const gstPercent = Number(r.gstPercent || 0);
    const taxableAmount = quantity * rate;
    const gstAmount = taxableAmount * (gstPercent / 100);
    return {
      categoryId: r.categoryId,
      categoryLabel: CATEGORY_LABELS[r.categoryId] || `Category ${r.categoryId}`,
      type: r.type, quantity, rate, taxableAmount, gstPercent,
      gstAmount, totalAmount: taxableAmount + gstAmount, rateSource: r.rateSource,
    };
  }).filter((r) => r.quantity > 0 && r.totalAmount > 0);
}

export function breakdownToTargetRows(breakdown?: BillingTargetBreakdown[]): TargetBillingRow[] {
  return (breakdown || []).map((r, i) => ({
    key: `${r.categoryId}-${r.type}-${i}`, categoryId: r.categoryId, type: r.type,
    quantity: String(r.quantity || ""), rate: String(r.rate || ""),
    gstPercent: String(r.gstPercent || 0), include: true, rateSource: r.rateSource || "manual",
  }));
}

export function dateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

export function isAppliedAdvancePayment(payment: Payment) {
  return payment.source === "advance_application" ||
    payment.paymentMode === "Advance Applied" ||
    /applied from advance/i.test(payment.notes || "");
}

export function restoreSuggestion(email: string, current: EmailOption[], catalog: EmailOption[]) {
  if (current.some((e) => e.email === email)) return current;
  const match = catalog.find((e) => e.email === email);
  if (!match) return current;
  return catalog.filter((e) => e.email === email || current.some((c) => c.email === e.email))
    .map((e) => e.email === email ? match : current.find((c) => c.email === e.email) || e);
}

export function buildLinkedContactEmailOptions(contacts: ClientContact[]) {
  const selected: EmailOption[] = [];
  const suggestions: EmailOption[] = [];
  const selectedSet = new Set<string>();
  const suggestionSet = new Set<string>();
  contacts.forEach((contact) => {
    const sel = Array.from(new Set((contact.emails || []).filter(Boolean)));
    const sug = Array.from(new Set((contact.allEmails || []).filter((e) => e && !sel.includes(e))));
    sel.forEach((email) => { if (selectedSet.has(email)) return; selectedSet.add(email); selected.push({ label: contact.name, email }); });
    sug.forEach((email) => { if (selectedSet.has(email) || suggestionSet.has(email)) return; suggestionSet.add(email); suggestions.push({ label: contact.name, email }); });
  });
  return { selected, suggestions };
}

export function statusBorderStyle(billing: Billing): CSSProperties {
  const isOverdue = (billing.daysOverdue ?? 0) > 0;
  const status = billing.paymentStatus?.toLowerCase();
  if (status === "paid" || billing.pendingAmount <= 0) return { borderLeft: "3px solid #34d399" };
  if (isOverdue) return { borderLeft: "3px solid #f87171" };
  if (status === "partial") return { borderLeft: "3px solid #fbbf24" };
  return { borderLeft: "3px solid #f87171" };
}
