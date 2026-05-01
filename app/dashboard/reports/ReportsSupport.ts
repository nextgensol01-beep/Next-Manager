import { ArrowLeftRight, ClipboardCheck, CreditCard, FileText, Leaf, Upload, Users } from "lucide-react";
import {
  CUSTOM_CLIENT_EXPORT_FIELDS,
  REPORT_DEFINITIONS,
  type CustomClientExportField,
  type CustomClientExportFieldDefinition,
  type ReportType,
} from "@/lib/reports";
export const DEFAULT_CUSTOM_FIELDS: CustomClientExportField[] = ["companyName", "state", "gstNumber"];
export const CUSTOM_EXPORT_USER_PRESETS_KEY = "reports.customExportPresets.v1";

export type ClientOption = {
  clientId: string;
  companyName: string;
  category: string;
};

export type CustomExportPreview = {
  fy: string;
  fields: CustomClientExportField[];
  previewColumns: Array<{
    id: CustomClientExportField;
    label: string;
    group: string;
    fyScoped: boolean;
    nonEmptyCount: number;
  }>;
  summary: {
    matchedClients: number;
    withContacts: number;
    withBilling: number;
    withPayments: number;
    withDocuments: number;
    withEmails: number;
    withAnnualReturn: number;
  };
};

export type AdvancedCustomExportSection =
  | "presets"
  | "filters"
  | "selected-fields"
  | "preview"
  | "summary";

export function arraysEqual<T>(left: T[], right: T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function sameMembers<T extends string>(left: T[], right: T[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

export const REPORT_VISUALS: Record<ReportType, { icon: typeof Users; color: string; darkColor: string }> = {
  targets: { icon: Users, color: "bg-blue-50 text-blue-600", darkColor: "dark:bg-blue-900/30 dark:text-blue-400" },
  pwp: { icon: Leaf, color: "bg-emerald-50 text-emerald-600", darkColor: "dark:bg-emerald-900/30 dark:text-emerald-400" },
  transactions: { icon: ArrowLeftRight, color: "bg-violet-50 text-violet-600", darkColor: "dark:bg-violet-900/30 dark:text-violet-400" },
  payments: { icon: CreditCard, color: "bg-amber-50 text-amber-600", darkColor: "dark:bg-amber-900/30 dark:text-amber-400" },
  invoices: { icon: FileText, color: "bg-rose-50 text-rose-600", darkColor: "dark:bg-rose-900/30 dark:text-rose-400" },
  "annual-return": { icon: ClipboardCheck, color: "bg-indigo-50 text-indigo-600", darkColor: "dark:bg-indigo-900/30 dark:text-indigo-400" },
  uploads: { icon: Upload, color: "bg-teal-50 text-teal-600", darkColor: "dark:bg-teal-900/30 dark:text-teal-400" },
};

export const REPORT_TYPES = REPORT_DEFINITIONS.map((report) => ({
  ...report,
  ...REPORT_VISUALS[report.id],
}));

export const CUSTOM_EXPORT_GROUPS = Array.from(
  CUSTOM_CLIENT_EXPORT_FIELDS.reduce((map, field) => {
    const existing = map.get(field.group) || [];
    existing.push(field);
    map.set(field.group, existing);
    return map;
  }, new Map<string, CustomClientExportFieldDefinition[]>())
);