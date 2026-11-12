export const BILLING_REPORT_CATEGORIES = [
  { id: "annual_return", label: "Annual Return" },
  { id: "general_consultancy", label: "General Billing / Consultancy" },
  { id: "epr_target", label: "EPR Targets" },
  { id: "registration_migration", label: "Registration / Migration" },
  { id: "other", label: "Other" },
  { id: "unclassified", label: "Unclassified" },
] as const;
export type BillingReportCategory = typeof BILLING_REPORT_CATEGORIES[number]["id"];
export const billingCategoryLabel = (id: string) => BILLING_REPORT_CATEGORIES.find(c => c.id === id)?.label || "Unclassified";
