import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { connectDB } from "@/lib/mongoose";
import { errorResponse, requireSession } from "@/lib/route-utils";
import { executeReportStudio } from "@/lib/server/report-studio-service";
import { finaliseReadableReportSheet } from "@/lib/server/excel-report-style";
import { reportStudioExcelFormat, reportStudioExcelValue } from "@/lib/server/report-studio-excel";
import { reportStudioExcelColor } from "@/lib/report-studio";

export async function POST(request: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  try {
    await connectDB();
    const report = await executeReportStudio(await request.json(), { exportAll: true });
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
      ["Financial Year", report.config.financialYear],
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
    return errorResponse(error, "Unable to export Report Studio", error instanceof Error && /Field|Operator|Invalid|expected/i.test(error.message) ? 400 : 500);
  }
}
