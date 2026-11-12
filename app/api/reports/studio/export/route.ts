import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { connectDB } from "@/lib/mongoose";
import { errorResponse, requireSession } from "@/lib/route-utils";
import { executeReportStudio } from "@/lib/server/report-studio-service";
import { finaliseReadableReportSheet } from "@/lib/server/excel-report-style";
import { reportStudioExcelFormat, reportStudioExcelValue } from "@/lib/server/report-studio-excel";
import { reportStudioExcelColor } from "@/lib/report-studio";
import { executeBillingReport } from "@/lib/server/billing-report-service";
import { billingReportWorkbook } from "@/lib/server/billing-report-excel";
import { ZodError } from "zod";
import { isAdminSession } from "@/lib/authUsers";
import { isRestrictedReportSource } from "@/lib/report-datasets";

export async function POST(request: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  try {
    await connectDB();
    const body = await request.json();
    if (isRestrictedReportSource(body?.source) && !await isAdminSession(guard.session)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    if (body?.mode === "billing-report") {
      const financial = await executeBillingReport(body.report, true);
      return new NextResponse(await billingReportWorkbook(financial), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="billing-${financial.options.view}-${financial.options.financialYear}.xlsx"`,
        "Cache-Control": "no-store",
      } });
    }
    const report = await executeReportStudio(body, { exportAll: true });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Nextgen Solutions Report Studio";
    workbook.created = new Date();

    const results = workbook.addWorksheet("Report Results");
    results.columns = report.columns.map((column) => ({ header: column.label, key: column.id, width: Math.min(32, Math.max(14, column.label.length + 4)) }));
    report.rows.forEach((row) => results.addRow(Object.fromEntries(report.columns.map((column) => [column.id, reportStudioExcelValue(row.values[column.id] ?? null, column.type)]))));
    report.columns.forEach((column) => {
      const format = reportStudioExcelFormat(column.type);
      if (format) results.getColumn(column.id).numFmt = format;
    });

    const summary = workbook.addWorksheet("Configuration & Summary");
    summary.columns = [{ header: "Setting", key: "setting", width: 34 }, { header: "Value", key: "value", width: 70 }];
    [
      ["Report", report.config.name],
      ["Source", report.config.source],
      ["Financial Year", [...new Set([report.config.financialYear, ...(report.config.billingScope?.years ?? []), ...(report.config.comparisonYears ?? [])])].join(", ")],
      ["Generated at", report.generatedAt || new Date().toISOString()],
      ["Export scope", "All matching rows"],
      ["Client search", report.config.search || "None"],
      ["Filters", JSON.stringify(report.config.filters)],
      ...(report.config.billingScope?.filters ? [["Bill and charge scope", JSON.stringify(report.config.billingScope.filters)]] : []),
      ["Matched Clients", report.summary.matchedClients],
      ["Columns", report.columns.map((column) => column.label).join(", ")],
      ["Group By", report.config.groupBy.join(", ") || "None"],
    ].forEach(([setting, value]) => summary.addRow({ setting, value }));
    report.summary.metrics.forEach((metric) => {
      const row = summary.addRow({ setting: metric.label, value: metric.value });
      const format = reportStudioExcelFormat(metric.type);
      if (format) row.getCell(2).numFmt = format;
    });
    if (report.quality.messages.length > 0) summary.addRow({ setting: "Data Quality", value: report.quality.messages.join(" ") });
    report.summary.subtotals?.forEach((subtotal, index) => {
      const fields = report.columns.filter(column => subtotal.dimensions.includes(column.id) || report.config.metrics.includes(column.id));
      const sheet = workbook.addWorksheet(`Subtotals Level ${index + 1}`);
      sheet.columns = fields.map(field => ({ header: field.label, key: field.id, width: 24 }));
      subtotal.rows.forEach(row => sheet.addRow(Object.fromEntries(fields.map(field => [field.id, reportStudioExcelValue(row.values[field.id] ?? null, field.type)]))));
      fields.forEach(field => {
        const format = reportStudioExcelFormat(field.type);
        if (format) sheet.getColumn(field.id).numFmt = format;
      });
    });

    if (report.config.view === "analysis") {
      const analysis = report.summary.analysis;
      const analysisSheet = workbook.addWorksheet("Field Analysis");
      analysisSheet.columns = [
        { header: "Result", key: "label", width: 34 },
        { header: "Clients", key: "value", width: 18 },
        { header: "% of Matching", key: "percent", width: 18 },
      ];
      [
        ["Field", analysis.field.label, ""],
        ["Analysis", analysis.transform, ""],
        ["Total Clients", analysis.total, 100],
        ["Applicable Clients", analysis.applicable, analysis.total > 0 ? analysis.applicable / analysis.total * 100 : 0],
        ["Recorded", analysis.recorded, analysis.total > 0 ? analysis.recorded / analysis.total * 100 : 0],
        ["No Record", analysis.missing, analysis.total > 0 ? analysis.missing / analysis.total * 100 : 0],
        ["Not Applicable", analysis.excluded, analysis.total > 0 ? analysis.excluded / analysis.total * 100 : 0],
      ].forEach(([label, value, percent]) => analysisSheet.addRow({ label, value, percent }));
      analysisSheet.addRow({});
      analysis.buckets.forEach((bucket) => analysisSheet.addRow({
        label: bucket.label,
        value: bucket.value,
        percent: analysis.total > 0 ? bucket.value / analysis.total * 100 : 0,
      }));
      analysisSheet.getColumn("percent").numFmt = "0.0%";
      analysisSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && typeof row.getCell("percent").value === "number") {
          row.getCell("percent").value = Number(row.getCell("percent").value) / 100;
        }
      });
    }

    const businessResults = workbook.addWorksheet("Report Insights");
    businessResults.columns = [
      { header: "Related Section", key: "group", width: 24 },
      { header: "Report Insight", key: "label", width: 34 },
      { header: "Value", key: "value", width: 22 },
      { header: "Business Meaning", key: "description", width: 76 },
    ];
    report.summary.businessResults.forEach((result) => {
      const row = businessResults.addRow({ group: result.group || "Report", label: result.label, value: result.value ?? "No Record", description: result.description });
      const format = reportStudioExcelFormat(result.type);
      if (format && typeof result.value === "number") row.getCell("value").numFmt = format;
    });

    const columnResults = workbook.addWorksheet("Column Results");
    columnResults.columns = [
      { header: "Column", key: "column", width: 34 },
      { header: "Result", key: "result", width: 24 },
      { header: "Value", key: "value", width: 22 },
      { header: "Meaning", key: "description", width: 76 },
    ];
    report.summary.columnResults.forEach((columnResult) => {
      const definition = report.columns.find((column) => column.id === columnResult.field);
      columnResult.results.forEach((result) => {
        const row = columnResults.addRow({ column: definition?.label || columnResult.field, result: result.label, value: result.value ?? "No Record", description: result.description });
        const format = reportStudioExcelFormat(result.type);
        if (format && typeof result.value === "number") row.getCell("value").numFmt = format;
      });
    });

    workbook.worksheets.forEach((sheet) => finaliseReadableReportSheet(sheet, {
      freezeColumns: sheet.name === "Report Results" ? 1 : 0,
      columnColors: sheet.name === "Report Results"
        ? Object.fromEntries(report.columns.map((column, index) => [index + 1, reportStudioExcelColor(column, report.config.excelColumnColors)]))
        : undefined,
    }));
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = report.config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report-studio";
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}-${report.config.financialYear}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "Unable to export Report Studio", error instanceof ZodError || error instanceof Error && /Field|Operator|Invalid|expected/i.test(error.message) ? 400 : 500);
  }
}
