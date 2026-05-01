export type InvoiceCoverageType = "sale" | "purchase";

export type InvoiceCoverageInput = {
  invoiceType?: string | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
};

export type InvoiceTypeCoverage = {
  doneCount: number;
  leftCount: number;
  doneMonths: string[];
  leftMonths: string[];
  doneText: string;
  leftText: string;
};

export type InvoiceCoverageSummary = Record<InvoiceCoverageType, InvoiceTypeCoverage>;

const FINANCIAL_YEAR_MONTHS = [
  { label: "Apr", month: 3, yearOffset: 0 },
  { label: "May", month: 4, yearOffset: 0 },
  { label: "Jun", month: 5, yearOffset: 0 },
  { label: "Jul", month: 6, yearOffset: 0 },
  { label: "Aug", month: 7, yearOffset: 0 },
  { label: "Sep", month: 8, yearOffset: 0 },
  { label: "Oct", month: 9, yearOffset: 0 },
  { label: "Nov", month: 10, yearOffset: 0 },
  { label: "Dec", month: 11, yearOffset: 0 },
  { label: "Jan", month: 0, yearOffset: 1 },
  { label: "Feb", month: 1, yearOffset: 1 },
  { label: "Mar", month: 2, yearOffset: 1 },
] as const;

function parseFinancialYearStart(fy: string): number {
  const match = /^(\d{4})-\d{2}$/.exec(fy);
  if (!match) return new Date().getUTCFullYear();
  return Number(match[1]);
}

function parseDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function getFinancialYearMonths(fy: string) {
  const startYear = parseFinancialYearStart(fy);
  return FINANCIAL_YEAR_MONTHS.map((entry) => {
    const year = startYear + entry.yearOffset;
    return {
      label: entry.label,
      key: monthKey(year, entry.month),
      start: new Date(Date.UTC(year, entry.month, 1)),
      end: new Date(Date.UTC(year, entry.month + 1, 0)),
    };
  });
}

export function getCoveredInvoiceMonths(
  fromDate: string | Date | null | undefined,
  toDate: string | Date | null | undefined,
  fy: string,
): string[] {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (!from || !to) return [];

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;

  return getFinancialYearMonths(fy)
    .filter((month) => start <= month.end && end >= month.start)
    .map((month) => month.key);
}

function emptyTypeCoverage(monthLabels: string[]): InvoiceTypeCoverage {
  return {
    doneCount: 0,
    leftCount: monthLabels.length,
    doneMonths: [],
    leftMonths: monthLabels,
    doneText: "-",
    leftText: monthLabels.join(", "),
  };
}

function summarizeTypeCoverage(coveredKeys: Set<string>, fy: string): InvoiceTypeCoverage {
  const fyMonths = getFinancialYearMonths(fy);
  const doneMonths = fyMonths.filter((month) => coveredKeys.has(month.key)).map((month) => month.label);
  const leftMonths = fyMonths.filter((month) => !coveredKeys.has(month.key)).map((month) => month.label);

  return {
    doneCount: doneMonths.length,
    leftCount: leftMonths.length,
    doneMonths,
    leftMonths,
    doneText: doneMonths.length > 0 ? doneMonths.join(", ") : "-",
    leftText: leftMonths.length > 0 ? leftMonths.join(", ") : "-",
  };
}

export function buildInvoiceCoverageSummary(
  invoices: InvoiceCoverageInput[],
  fy: string,
): InvoiceCoverageSummary {
  const monthLabels = getFinancialYearMonths(fy).map((month) => month.label);
  const covered: Record<InvoiceCoverageType, Set<string>> = {
    sale: new Set<string>(),
    purchase: new Set<string>(),
  };

  invoices.forEach((invoice) => {
    if (invoice.invoiceType !== "sale" && invoice.invoiceType !== "purchase") return;
    getCoveredInvoiceMonths(invoice.fromDate, invoice.toDate, fy).forEach((key) => {
      covered[invoice.invoiceType as InvoiceCoverageType].add(key);
    });
  });

  return {
    sale: covered.sale.size > 0 ? summarizeTypeCoverage(covered.sale, fy) : emptyTypeCoverage(monthLabels),
    purchase: covered.purchase.size > 0 ? summarizeTypeCoverage(covered.purchase, fy) : emptyTypeCoverage(monthLabels),
  };
}
