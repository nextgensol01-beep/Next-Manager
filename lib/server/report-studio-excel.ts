import type { ReportStudioCellValue, ReportStudioFieldType } from "@/lib/report-studio";

const QUANTITY_FORMAT = '#,##0;[Red]-#,##0;"–"';
export const REPORT_STUDIO_INR_FORMAT = '"INR" #,##0.00;[Red]-"INR" #,##0.00;"–"';

function formatInrText(value: number) {
  return `INR ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function reportStudioExcelValue(value: ReportStudioCellValue, type: ReportStudioFieldType) {
  if (Array.isArray(value)) {
    if (type === "currency-list") {
      const rates = value.map(Number).filter((entry) => Number.isFinite(entry)).sort((left, right) => left - right);
      if (rates.length === 0) return "No Record";
      if (rates.length === 1) return rates[0];
      return rates.map(formatInrText).join("; ");
    }
    return value.join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value ?? "No Record";
}

export function reportStudioExcelFormat(type: ReportStudioFieldType) {
  if (type === "currency" || type === "currency-list") return REPORT_STUDIO_INR_FORMAT;
  if (type === "percentage") return '0.0"%"';
  if (type === "quantity" || type === "number") return QUANTITY_FORMAT;
  if (type === "date") return "dd-mmm-yyyy";
  return undefined;
}
