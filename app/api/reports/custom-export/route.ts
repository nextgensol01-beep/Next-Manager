import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { buildCustomClientExportData, getFieldConfig } from "@/lib/server/custom-client-export";

const HEADER_COLOR = "FF2D47E2";

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_COLOR } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF1E30A8" } } };
  });
  row.height = 22;
}

function applyDataStyle(row: ExcelJS.Row, idx: number) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: idx % 2 === 0 ? "FFDBEAFE" : "FFFFFFFF" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 18;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();
    const result = await buildCustomClientExportData(body);

    if (result.fields.length === 0) {
      return NextResponse.json({ error: "No non-empty fields matched the current filters" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Nextgen Solutions ERP";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Custom Client Export");
    worksheet.columns = result.fields.map((field) => {
      const config = getFieldConfig(field);
      return {
        header: config?.label || field,
        key: field,
        width: config?.width || 18,
      };
    });

    applyHeaderStyle(worksheet.getRow(1));
    result.rows.forEach((rowData, index) => {
      const row = worksheet.addRow(rowData);
      applyDataStyle(row, index);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="custom-client-export-${result.fy}-${stamp}.xlsx"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("POST /api/reports/custom-export:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Select at least one") || message.includes("No non-empty fields") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
