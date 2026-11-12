import { BILLING_REPORT_CATEGORIES } from "./billing-report-categories";
import type { BillingAnalysisSource } from "./report-datasets";
import type { ReportStudioFieldDefinition } from "./report-studio";

type Field = Pick<ReportStudioFieldDefinition, "id" | "label" | "description" | "group" | "type" | "role" | "options">;
const describe = (group: string) => (id: string, label: string, type: Field["type"] = "string", description = label, options?: string[]): Field =>
  ({ id, label, description, group, type, role: ["number", "currency", "quantity"].includes(type) ? "metric" : "dimension", options });
const bill = describe("Bill details");
const charges = describe("Charge details");
const targets = describe("EPR target details");
const tax = describe("Taxes");
const payments = describe("Payments");
const balances = describe("Outstanding balances");
const breakdown = describe("Selected charge breakdown");

export const BILL_TYPES = ["General", "Annual Return"];
export const CHARGE_KINDS = ["EPR target", "Government", "Consultancy", "Other fixed charge", "Line item"];
export const TARGET_CATEGORIES = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"];
export const TARGET_CREDIT_TYPES = ["Recycling", "EOL"];

const identity = [
  bill("bill.id", "Bill ID"), bill("bill.reference", "Bill reference"), bill("bill.invoiceNumber", "Invoice number"),
  bill("bill.type", "Bill type", "string", "General or Annual Return. Legacy bills without a type are treated as Annual Return.", BILL_TYPES),
  bill("bill.date", "Bill date", "date"), bill("bill.invoiceDate", "Invoice date", "date"), bill("bill.dueDate", "Due date", "date"),
  bill("bill.month", "Bill month"), bill("bill.invoiceMonth", "Invoice month"), bill("bill.dueMonth", "Due month"),
];
const billChargeFields = [
  bill("bill.chargeTypes", "Charge types on bill", "string-list", "Stored charge types across the whole bill.", CHARGE_KINDS),
  bill("bill.classifications", "Charge classifications on bill", "string-list", "Charge classifications across the whole bill, including Unclassified.", BILLING_REPORT_CATEGORIES.map(category => category.label)),
  bill("bill.classificationCount", "Classification count on bill", "number", "Number of distinct classifications across the whole bill."),
];
const fullBill = [
  bill("bill.gross", "Full bill gross", "currency", "Recorded whole-bill gross. Includes all charges on qualifying bills."),
  payments("bill.paid", "Full bill paid", "currency", "Payments allocated to qualifying bills, including applied advances."),
  payments("bill.overpayment", "Bill overpayments", "currency", "Allocated amounts exceeding each full bill’s gross."),
  balances("bill.outstanding", "Full bill outstanding", "currency", "Outstanding per qualifying bill, without offsetting other bills’ overpayments."),
];
const billStatus = [
  payments("bill.paymentStatus", "Bill payment status", "string", "Status of the whole bill.", ["Paid", "Partial", "Unpaid"]),
  balances("bill.overdue", "Bill overdue", "boolean", "An open bill whose recorded due date has passed.", ["true", "false"]),
];
const chargeLine = [
  charges("charge.description", "Charge description"),
  charges("charge.kind", "Charge type", "string", "Structural charge type from the stored billing fields.", CHARGE_KINDS),
  charges("charge.classification", "Charge classification", "string", "Billing classification or explicit Unclassified.", BILLING_REPORT_CATEGORIES.map(category => category.label)),
  targets("charge.targetCategory", "Target category", "string", "Recorded category on a reconciled EPR line.", TARGET_CATEGORIES),
  targets("charge.creditType", "Credit type", "string", "Recorded Recycling or EOL type.", TARGET_CREDIT_TYPES),
  { ...targets("charge.quantity", "Recorded line quantity", "quantity", "General line items and target quantities can have different units."), role: "dimension" as const },
  targets("charge.targetQuantity", "EPR target quantity", "quantity", "Quantity on a reconciled EPR target line."),
  { ...targets("charge.rate", "Rate", "currency", "Recorded unit rate. Unit rates are non-additive."), role: "dimension" as const },
  charges("charge.gross", "Charge gross", "currency", "Gross for the selected charge, inclusive of recorded tax."),
  tax("charge.taxable", "Taxable amount", "currency"),
  tax("charge.gst", "GST", "currency"),
  { ...tax("charge.gstRate", "GST rate", "percentage"), role: "dimension" as const },
];

export const BILLING_SCOPE_FIELDS = [...identity, ...billChargeFields, ...fullBill, ...billStatus, ...chargeLine];
export const BILLING_CONDITIONAL_CHARGES = [
  ...CHARGE_KINDS.slice(0, 4).map((value, index) => ({ field: "charge.kind", value, id: ["epr", "government", "consultancy", "otherFixed"][index], label: `${value} gross` })),
  ...BILLING_REPORT_CATEGORIES.map(category => ({ field: "charge.classification", value: category.label, id: category.id, label: `${category.label} classified gross` })),
].map(entry => ({ ...entry, id: `charge.breakdown.${entry.id}` }));
export const BILLING_TARGET_COLUMNS = TARGET_CATEGORIES.flatMap((category, index) => TARGET_CREDIT_TYPES.map(type => ({
  category, type, prefix: `charge.cat${index + 1}.${type.toLowerCase()}`,
})));

const selectedCharges = [
  charges("charge.selectedGross", "Selected charge gross", "currency", "Only charges matching the bill and charge scope."),
  tax("charge.selectedTaxable", "Selected taxable amount", "currency", "Available when all selected charges have a verified tax split."),
  tax("charge.selectedGst", "Selected GST", "currency", "Available when all selected charges have a verified tax split."),
  charges("charge.classifications", "Selected classifications", "string-list"),
  ...BILLING_CONDITIONAL_CHARGES.map(entry => breakdown(entry.id, entry.label, "currency")),
  ...BILLING_TARGET_COLUMNS.flatMap(({ category, type, prefix }) => [
    targets(`${prefix}.quantity`, `${category} ${type} quantity`, "quantity"),
    { ...targets(`${prefix}.rate`, `${category} ${type} rate`, "currency", "Shown when matching lines share one known rate."), role: "dimension" as const },
    targets(`${prefix}.gross`, `${category} ${type} gross`, "currency"),
  ]),
];

export function billingOutputFields(source: BillingAnalysisSource) {
  if (source === "billing-charges") return [...identity, ...chargeLine];
  if (source === "billing-bills") return [...identity, ...billChargeFields, ...fullBill, ...billStatus, ...selectedCharges];
  return [
    bill("bill.count", "Bill count", "number"),
    bill("bill.generalGross", "General bill gross", "currency"), bill("bill.annualReturnGross", "Annual Return bill gross", "currency"),
    balances("bill.overdueCount", "Overdue bills", "number"), ...fullBill, ...selectedCharges,
  ];
}
