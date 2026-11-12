import ExcelJS from "exceljs";
import type { BillingReportResponse } from "@/lib/billing-report";
import { finaliseReadableReportSheet } from "./excel-report-style";

export async function billingReportWorkbook(report: BillingReportResponse) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "NextGen Solutions Report Studio";
  const add = (name: string, headers: string[], rows: Array<Array<string | number | boolean | null>>) => {
    const sheet = wb.addWorksheet(name);
    sheet.columns = headers.map((header, index) => ({ header, key: String(index), width: Math.min(42, Math.max(16, header.length + 3)) }));
    rows.forEach(row => sheet.addRow(row));
    // Plain strings are kept as strings; no formula objects or external links.
    sheet.eachRow((row, index) => { if (index > 1) row.eachCell(cell => { if (typeof cell.value === "number") cell.numFmt = "#,##0.00"; }); });
    finaliseReadableReportSheet(sheet, { freezeColumns: 1 });
  };
  const bills = report.options.view === "company" ? report.companies.flatMap(c => c.bills) : report.bills;
  if (report.options.view === "company") add("Companies", ["Client ID", "Company", "Bills", "Billed gross", "Selected category gross", "Bill-level allocated payments to date", "Bill-level outstanding", "Overpayment", "Unapplied advance balance"], report.companies.map(c => [c.clientId, c.companyName, c.billCount, c.billed, c.selectedGross, c.paid, c.outstanding, c.overpayment, c.advance]));
  if (bills.length || report.options.view !== "component") add("Bills", ["Billing ID", "Client ID", "Company", "Invoice number", "Invoice date", "Bill date", "Financial year", "Bill type", "Title", "Invoice created", "Billed gross", "Selected category gross", "Bill-level allocated payments to date", "Bill-level outstanding", "Overpayment", "Payment status", "Warnings"], bills.map(b => [b.billingId, b.clientId, b.companyName, b.invoiceNumber, b.invoiceDate, b.billDate, b.financialYear, b.billType, b.title, b.invoiceCreated, b.billed, b.selectedGross, b.paid, b.outstanding, b.overpayment, b.paymentStatus, b.warnings.join("; ")]));
  if (report.options.view === "component") add("Components", ["Billing ID", "Client ID", "Company", "Invoice number", "Description", "Category", "Quantity", "Rate", "Taxable amount (if known)", "GST (if known)", "Billed gross", "Tax detail"], report.components.map(c => [c.billingId, c.clientId, c.companyName, c.invoiceNumber, c.description, c.categoryLabel, c.quantity, c.rate, c.taxable, c.gst, c.gross, c.taxKnown ? "Known" : "Unavailable"]));
  add("Reconciliation", ["Measure", "Value"], [
    ["Financial year", report.options.financialYear], ["Filters", JSON.stringify(report.options)], ["Export scope", "All matching rows"],
    ["Baseline FY bills", report.summary.baselineBills], ["Baseline FY billed gross", report.summary.baselineBilled],
    ["Matched bills", report.summary.billCount], ["Matched companies", report.summary.companyCount],
    ["Selected bills gross", report.summary.billed], ["Bill-level allocations to date", report.summary.paid], ["Bill-level outstanding", report.summary.outstanding],
    ["Unapplied advances (matched companies, all FYs)", report.summary.advance], ["Overpayments", report.summary.overpayment],
    ["Selected component gross", report.summary.componentGross], ["All components of matched bills", report.summary.allComponentGross],
    ["Unclassified components", report.summary.unclassifiedCount], ["Unclassified gross", report.summary.unclassifiedGross],
    ["Component discrepancy bills", report.summary.discrepancyBills], ["Unresolved payments (FY/search scope)", report.summary.unresolvedPayments],
    ["Excluded bills", report.summary.excludedBills], ["Exclusions by stage", JSON.stringify(report.summary.exclusions)],
    ["Payment basis", "Bill-level allocations only; unapplied advances and unresolved payments never reduce outstanding. Component payments/outstanding are not allocated."],
    ["Tax basis", "Gross amounts. Historical fixed charges may have no tax breakdown; unknown tax is not zero tax."],
  ]);
  add("Payment Review", ["Payment ID", "Client ID", "Linked billing ID", "Amount", "Reason"], report.issues.map(i => [i.paymentId, i.clientId, i.billingId, i.amount, i.reason]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
