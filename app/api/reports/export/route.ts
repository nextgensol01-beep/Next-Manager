import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import Invoice from "@/models/Invoice";
import UploadRecord from "@/models/UploadRecord";
import AnnualReturn from "@/models/AnnualReturn";
import ExcelJS from "exceljs";
import { CURRENT_FY, FINANCIAL_YEARS } from "@/lib/utils";
import { REPORT_FILE_PREFIX, isReportType, type ReportType } from "@/lib/reports";

const HEADER_COLOR = "FF2D47E2";
const INR_NUM_FMT = "\"INR\" #,##0.00";
type CreditBreakupType = "RECYCLING" | "EOL";

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
      type: "pattern", pattern: "solid",
      fgColor: { argb: idx % 2 === 0 ? "FFDBEAFE" : "FFFFFFFF" },
    };
    cell.border = {
      top:    { style: "thin", color: { argb: "FFE2E8F0" } },
      left:   { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right:  { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 18;
}

function hasOwn(rec: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(rec, key);
}

function fyStructuredTotal(
  rec: Record<string, unknown>,
  fieldName: "generated" | "targets",
  categoryId: string,
  creditType?: CreditBreakupType,
): number {
  const entries = Array.isArray(rec[fieldName]) ? rec[fieldName] as Record<string, unknown>[] : [];
  return entries.reduce((sum, entry) => (
    String(entry.categoryId || "") === categoryId &&
    (!creditType || String(entry.type || "").toUpperCase() === creditType)
      ? sum + (Number(entry.value) || 0)
      : sum
  ), 0);
}

// Read a field from a mongoose lean object â€” prefer canonical flat fields,
// then structured arrays, then legacy aliases.
function fyField(
  rec: Record<string, unknown> | null,
  canonical: string,
  legacy: string,
  structuredField?: "generated" | "targets",
  categoryId?: string,
  creditType?: CreditBreakupType,
): number {
  if (!rec) return 0;
  if (creditType && structuredField && categoryId && hasOwn(rec, structuredField)) {
    return fyStructuredTotal(rec, structuredField, categoryId, creditType);
  }
  if (hasOwn(rec, canonical)) {
    const cv = Number(rec[canonical]);
    if (!Number.isFinite(cv)) return 0;
    return creditType === "EOL" ? 0 : cv;
  }
  if (structuredField && categoryId && hasOwn(rec, structuredField)) {
    return fyStructuredTotal(rec, structuredField, categoryId);
  }
  if (hasOwn(rec, legacy)) {
    const lv = Number(rec[legacy]);
    if (!Number.isFinite(lv)) return 0;
    return creditType === "EOL" ? 0 : lv;
  }
  return 0;
}

function normaliseCreditType(value: unknown): CreditBreakupType {
  return String(value || "").toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

// Read qty from a credit transaction â€” prefer canonical qty fields,
// then legacy aliases.
function txCatQty(tx: Record<string, unknown>, i: number): number {
  const canonicalKey = `cat${i}Qty`;
  const legacyKey = `cat${i}`;
  if (hasOwn(tx, canonicalKey)) {
    const canonical = Number(tx[canonicalKey]);
    return Number.isFinite(canonical) ? canonical : 0;
  }
  if (hasOwn(tx, legacyKey)) {
    const legacy = Number(tx[legacyKey]);
    return Number.isFinite(legacy) ? legacy : 0;
  }
  return 0;
}

function inclusiveDaySpan(fromDate: string | Date, toDate: string | Date): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const utcFrom = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const utcTo = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(1, Math.round((utcTo - utcFrom) / 86400000) + 1);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");
    const fy = searchParams.get("fy") || CURRENT_FY;

    if (!typeParam) {
      return NextResponse.json({ error: "Report type is required" }, { status: 400 });
    }

    if (!isReportType(typeParam)) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    if (!FINANCIAL_YEARS.includes(fy)) {
      return NextResponse.json({ error: "Invalid financial year" }, { status: 400 });
    }

    const type: ReportType = typeParam;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Nextgen Solutions ERP";
    wb.created = new Date();

  // â”€â”€ TARGETS (PIBO: Producer / Importer / Brand Owner) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === "targets") {
    const ws = wb.addWorksheet("Targets");
    ws.columns = [
      { header: "Client ID",       key: "clientId",      width: 14 },
      { header: "Company Name",    key: "companyName",   width: 32 },
      { header: "Category",        key: "category",      width: 14 },
      { header: "FY",              key: "fy",            width: 10 },
      { header: "Target Recycling CAT-I",   key: "tcat1Recycling",   width: 20 },
      { header: "Target Recycling CAT-II",  key: "tcat2Recycling",   width: 20 },
      { header: "Target Recycling CAT-III", key: "tcat3Recycling",   width: 21 },
      { header: "Target Recycling CAT-IV",  key: "tcat4Recycling",   width: 20 },
      { header: "Target EOL CAT-I",         key: "tcat1Eol",         width: 15 },
      { header: "Target EOL CAT-II",        key: "tcat2Eol",         width: 15 },
      { header: "Target EOL CAT-III",       key: "tcat3Eol",         width: 16 },
      { header: "Target EOL CAT-IV",        key: "tcat4Eol",         width: 15 },
      { header: "Total Target",    key: "totalTarget",   width: 14 },
      { header: "Achieved Recycling CAT-I",   key: "acat1Recycling",   width: 22 },
      { header: "Achieved Recycling CAT-II",  key: "acat2Recycling",   width: 22 },
      { header: "Achieved Recycling CAT-III", key: "acat3Recycling",   width: 23 },
      { header: "Achieved Recycling CAT-IV",  key: "acat4Recycling",   width: 22 },
      { header: "Achieved EOL CAT-I",         key: "acat1Eol",         width: 17 },
      { header: "Achieved EOL CAT-II",        key: "acat2Eol",         width: 17 },
      { header: "Achieved EOL CAT-III",       key: "acat3Eol",         width: 18 },
      { header: "Achieved EOL CAT-IV",        key: "acat4Eol",         width: 17 },
      { header: "Total Achieved",  key: "totalAchieved", width: 15 },
      { header: "Remaining Recycling", key: "remainingRecycling", width: 18 },
      { header: "Remaining EOL",       key: "remainingEol",       width: 14 },
      { header: "Remaining",       key: "remaining",     width: 13 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const clients = await Client.find({ category: { $in: ["Producer", "Importer", "Brand Owner"] } }).sort({ companyName: 1 }).lean();
    const clientIds = clients.map((client) => client.clientId);
    const [fyRecords, incomingTransactions] = await Promise.all([
      FinancialYear.find({ clientId: { $in: clientIds }, financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
      CreditTransaction.find({ toClientId: { $in: clientIds }, financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
    ]);
    const fyMap = new Map(fyRecords.map((record) => [String(record.clientId), record]));
    const incomingTransactionsMap = new Map<string, Record<string, unknown>[]>();
    incomingTransactions.forEach((tx) => {
      const clientId = String(tx.toClientId || "");
      if (!clientId) return;
      const existing = incomingTransactionsMap.get(clientId) || [];
      existing.push(tx);
      incomingTransactionsMap.set(clientId, existing);
    });

    let rowIdx = 0;
    for (const client of clients) {
      const fyRec = fyMap.get(client.clientId) || null;
      const txTo  = incomingTransactionsMap.get(client.clientId) || [];

      const tcatRecycling = [1,2,3,4].map((i) =>
        fyField(fyRec, `cat${i}Target`, `targetCat${i}`, "targets", String(i), "RECYCLING")
      );
      const tcatEol = [1,2,3,4].map((i) =>
        fyField(fyRec, `cat${i}Target`, `targetCat${i}`, "targets", String(i), "EOL")
      );
      const acatRecycling = [1,2,3,4].map((i) =>
        txTo.reduce((sum, tx) => sum + (normaliseCreditType(tx.creditType) === "RECYCLING" ? txCatQty(tx, i) : 0), 0)
      );
      const acatEol = [1,2,3,4].map((i) =>
        txTo.reduce((sum, tx) => sum + (normaliseCreditType(tx.creditType) === "EOL" ? txCatQty(tx, i) : 0), 0)
      );

      const totalTargetRecycling = tcatRecycling.reduce((a, b) => a + b, 0);
      const totalTargetEol = tcatEol.reduce((a, b) => a + b, 0);
      const totalAchievedRecycling = acatRecycling.reduce((a, b) => a + b, 0);
      const totalAchievedEol = acatEol.reduce((a, b) => a + b, 0);
      const totalTarget = totalTargetRecycling + totalTargetEol;
      const totalAchieved = totalAchievedRecycling + totalAchievedEol;
      const remainingRecycling = totalTargetRecycling - totalAchievedRecycling;
      const remainingEol = totalTargetEol - totalAchievedEol;
      const remaining     = totalTarget - totalAchieved;

      const row = ws.addRow({
        clientId: client.clientId, companyName: client.companyName, category: client.category, fy,
        tcat1Recycling: tcatRecycling[0], tcat2Recycling: tcatRecycling[1], tcat3Recycling: tcatRecycling[2], tcat4Recycling: tcatRecycling[3],
        tcat1Eol: tcatEol[0], tcat2Eol: tcatEol[1], tcat3Eol: tcatEol[2], tcat4Eol: tcatEol[3],
        totalTarget,
        acat1Recycling: acatRecycling[0], acat2Recycling: acatRecycling[1], acat3Recycling: acatRecycling[2], acat4Recycling: acatRecycling[3],
        acat1Eol: acatEol[0], acat2Eol: acatEol[1], acat3Eol: acatEol[2], acat4Eol: acatEol[3],
        totalAchieved, remainingRecycling, remainingEol, remaining,
      });
      applyDataStyle(row, rowIdx++);

      // Colour remaining: 0 = green (fully achieved), >0 = orange (still pending)
      const remCell = row.getCell("remaining");
      remCell.font = { bold: remaining === 0, color: { argb: remaining === 0 ? "FF16A34A" : remaining < 0 ? "FF2563EB" : "FFEA580C" } };
      remCell.alignment = { horizontal: "right", vertical: "middle" };

      // Right-align numeric columns
      [
        "tcat1Recycling","tcat2Recycling","tcat3Recycling","tcat4Recycling",
        "tcat1Eol","tcat2Eol","tcat3Eol","tcat4Eol",
        "totalTarget",
        "acat1Recycling","acat2Recycling","acat3Recycling","acat4Recycling",
        "acat1Eol","acat2Eol","acat3Eol","acat4Eol",
        "totalAchieved","remainingRecycling","remainingEol","remaining"
      ].forEach((k) => {
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
    }

  // â”€â”€ PWP CREDITS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (type === "pwp") {
    const ws = wb.addWorksheet("PWP Credits");
    ws.columns = [
      { header: "Client ID",      key: "clientId",     width: 14 },
      { header: "Company Name",   key: "companyName",  width: 32 },
      { header: "FY",             key: "fy",           width: 10 },
      { header: "Credits Recycling CAT-I",   key: "ccat1Recycling",   width: 21 },
      { header: "Credits Recycling CAT-II",  key: "ccat2Recycling",   width: 21 },
      { header: "Credits Recycling CAT-III", key: "ccat3Recycling",   width: 22 },
      { header: "Credits Recycling CAT-IV",  key: "ccat4Recycling",   width: 21 },
      { header: "Credits EOL CAT-I",         key: "ccat1Eol",         width: 16 },
      { header: "Credits EOL CAT-II",        key: "ccat2Eol",         width: 16 },
      { header: "Credits EOL CAT-III",       key: "ccat3Eol",         width: 17 },
      { header: "Credits EOL CAT-IV",        key: "ccat4Eol",         width: 16 },
      { header: "Total Credits",  key: "totalCredits", width: 14 },
      { header: "Sold Recycling CAT-I",   key: "ucat1Recycling",   width: 18 },
      { header: "Sold Recycling CAT-II",  key: "ucat2Recycling",   width: 18 },
      { header: "Sold Recycling CAT-III", key: "ucat3Recycling",   width: 19 },
      { header: "Sold Recycling CAT-IV",  key: "ucat4Recycling",   width: 18 },
      { header: "Sold EOL CAT-I",         key: "ucat1Eol",         width: 13 },
      { header: "Sold EOL CAT-II",        key: "ucat2Eol",         width: 13 },
      { header: "Sold EOL CAT-III",       key: "ucat3Eol",         width: 14 },
      { header: "Sold EOL CAT-IV",        key: "ucat4Eol",         width: 13 },
      { header: "Total Sold",     key: "totalUsed",    width: 12 },
      { header: "Remaining Recycling", key: "remainingRecycling", width: 18 },
      { header: "Remaining EOL",       key: "remainingEol",       width: 14 },
      { header: "Remaining",      key: "remaining",    width: 12 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const clients = await Client.find({ category: "PWP" }).sort({ companyName: 1 }).lean();
    const clientIds = clients.map((client) => client.clientId);
    const [fyRecords, outgoingTransactions] = await Promise.all([
      FinancialYear.find({ clientId: { $in: clientIds }, financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
      CreditTransaction.find({ fromClientId: { $in: clientIds }, financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
    ]);
    const fyMap = new Map(fyRecords.map((record) => [String(record.clientId), record]));
    const outgoingTransactionsMap = new Map<string, Record<string, unknown>[]>();
    outgoingTransactions.forEach((tx) => {
      const clientId = String(tx.fromClientId || "");
      if (!clientId) return;
      const existing = outgoingTransactionsMap.get(clientId) || [];
      existing.push(tx);
      outgoingTransactionsMap.set(clientId, existing);
    });
    let rowIdx = 0;
    for (const client of clients) {
      const fyRec  = fyMap.get(client.clientId) || null;
      const txFrom = outgoingTransactionsMap.get(client.clientId) || [];

      const ccatRecycling = [1,2,3,4].map((i) =>
        fyField(fyRec, `cat${i}Generated`, `creditsCat${i}`, "generated", String(i), "RECYCLING")
      );
      const ccatEol = [1,2,3,4].map((i) =>
        fyField(fyRec, `cat${i}Generated`, `creditsCat${i}`, "generated", String(i), "EOL")
      );
      const ucatRecycling = [1,2,3,4].map((i) =>
        txFrom.reduce((sum, tx) => sum + (normaliseCreditType(tx.creditType) === "RECYCLING" ? txCatQty(tx, i) : 0), 0)
      );
      const ucatEol = [1,2,3,4].map((i) =>
        txFrom.reduce((sum, tx) => sum + (normaliseCreditType(tx.creditType) === "EOL" ? txCatQty(tx, i) : 0), 0)
      );

      const totalCreditsRecycling = ccatRecycling.reduce((a, b) => a + b, 0);
      const totalCreditsEol = ccatEol.reduce((a, b) => a + b, 0);
      const totalUsedRecycling = ucatRecycling.reduce((a, b) => a + b, 0);
      const totalUsedEol = ucatEol.reduce((a, b) => a + b, 0);
      const totalCredits = totalCreditsRecycling + totalCreditsEol;
      const totalUsed = totalUsedRecycling + totalUsedEol;
      const remainingRecycling = totalCreditsRecycling - totalUsedRecycling;
      const remainingEol = totalCreditsEol - totalUsedEol;
      const remaining    = totalCredits - totalUsed;

      const row = ws.addRow({
        clientId: client.clientId, companyName: client.companyName, fy,
        ccat1Recycling: ccatRecycling[0], ccat2Recycling: ccatRecycling[1], ccat3Recycling: ccatRecycling[2], ccat4Recycling: ccatRecycling[3],
        ccat1Eol: ccatEol[0], ccat2Eol: ccatEol[1], ccat3Eol: ccatEol[2], ccat4Eol: ccatEol[3],
        totalCredits,
        ucat1Recycling: ucatRecycling[0], ucat2Recycling: ucatRecycling[1], ucat3Recycling: ucatRecycling[2], ucat4Recycling: ucatRecycling[3],
        ucat1Eol: ucatEol[0], ucat2Eol: ucatEol[1], ucat3Eol: ucatEol[2], ucat4Eol: ucatEol[3],
        totalUsed, remainingRecycling, remainingEol, remaining,
      });
      applyDataStyle(row, rowIdx++);

      // PWP: remaining > 0 = green (credits available), 0 = amber, <0 = red (oversold)
      const remCell = row.getCell("remaining");
      remCell.font = { bold: true, color: { argb: remaining > 0 ? "FF16A34A" : remaining === 0 ? "FFCA8A04" : "FFDC2626" } };
      remCell.alignment = { horizontal: "right", vertical: "middle" };

      [
        "ccat1Recycling","ccat2Recycling","ccat3Recycling","ccat4Recycling",
        "ccat1Eol","ccat2Eol","ccat3Eol","ccat4Eol",
        "totalCredits",
        "ucat1Recycling","ucat2Recycling","ucat3Recycling","ucat4Recycling",
        "ucat1Eol","ucat2Eol","ucat3Eol","ucat4Eol",
        "totalUsed","remainingRecycling","remainingEol","remaining"
      ].forEach((k) => {
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
    }

  // â”€â”€ TRANSACTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (type === "transactions") {
    const ws = wb.addWorksheet("Transactions");
    ws.columns = [
      { header: "Date",         key: "date",        width: 14 },
      { header: "FY",           key: "fy",          width: 10 },
      { header: "From (PWP)",   key: "fromName",    width: 24 },
      { header: "To (PIBO)",    key: "toName",      width: 24 },
      { header: "Type",         key: "creditType",  width: 12 },
      { header: "CAT-I Qty",    key: "cat1",        width: 11 },
      { header: "CAT-I Rate",   key: "rateCat1",    width: 12 },
      { header: "CAT-II Qty",   key: "cat2",        width: 11 },
      { header: "CAT-II Rate",  key: "rateCat2",    width: 12 },
      { header: "CAT-III Qty",  key: "cat3",        width: 12 },
      { header: "CAT-III Rate", key: "rateCat3",    width: 13 },
      { header: "CAT-IV Qty",   key: "cat4",        width: 11 },
      { header: "CAT-IV Rate",  key: "rateCat4",    width: 12 },
      { header: "Total Qty",    key: "totalQty",    width: 11 },
      { header: "Total Amount", key: "totalAmount", width: 15 },
      { header: "Notes",        key: "notes",       width: 28 },
    ];
    applyHeaderStyle(ws.getRow(1));

    // Load client names for display
    const allClients = await Client.find().lean();
    const nameMap: Record<string, string> = {};
    allClients.forEach((c) => { nameMap[c.clientId] = c.companyName; });

    const txns = await CreditTransaction.find({ financialYear: fy }).sort({ date: -1 }).lean() as Record<string, unknown>[];
    let rowIdx = 0;
    for (const tx of txns) {
      const c1 = txCatQty(tx, 1); const c2 = txCatQty(tx, 2);
      const c3 = txCatQty(tx, 3); const c4 = txCatQty(tx, 4);
      const totalQty = c1 + c2 + c3 + c4;
      const row = ws.addRow({
        date:        new Date(tx.date as string).toLocaleDateString("en-IN"),
        fy:          tx.financialYear,
        fromName:    (tx.fromClientId ? nameMap[tx.fromClientId as string] || tx.fromClientId : "External"),
        toName:      (tx.toClientId   ? nameMap[tx.toClientId   as string] || tx.toClientId   : "External"),
        creditType:  tx.creditType || "Recycling",
        cat1: c1,   rateCat1: Number(tx.rateCat1) || 0,
        cat2: c2,   rateCat2: Number(tx.rateCat2) || 0,
        cat3: c3,   rateCat3: Number(tx.rateCat3) || 0,
        cat4: c4,   rateCat4: Number(tx.rateCat4) || 0,
        totalQty, totalAmount: Number(tx.totalAmount) || 0,
        notes: tx.notes || "",
      });
      applyDataStyle(row, rowIdx++);
      ["cat1","cat2","cat3","cat4","totalQty","rateCat1","rateCat2","rateCat3","rateCat4","totalAmount"].forEach((k) => {
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
      row.getCell("totalAmount").numFmt = INR_NUM_FMT;
      ["rateCat1","rateCat2","rateCat3","rateCat4"].forEach((k) => { row.getCell(k).numFmt = INR_NUM_FMT; });
    }

  // â”€â”€ PAYMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (type === "payments") {
    const ws = wb.addWorksheet("Payment Summary");
    ws.columns = [
      { header: "Client ID",         key: "clientId",      width: 14 },
      { header: "Company Name",      key: "companyName",   width: 32 },
      { header: "Category",          key: "category",      width: 14 },
      { header: "FY",                key: "fy",            width: 10 },
      { header: "Total Billed",      key: "totalAmount",   width: 14 },
      { header: "Billing Payments",  key: "billingPaid",   width: 16 },
      { header: "Advance Payments",  key: "advancePaid",   width: 16 },
      { header: "Total Received",    key: "totalReceived", width: 15 },
      { header: "Pending",           key: "pending",       width: 13 },
      { header: "Status",            key: "status",        width: 18 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const clients = await Client.find().sort({ companyName: 1 }).lean();
    const clientIds = clients.map((client) => client.clientId);
    const [billings, paymentsByFy] = await Promise.all([
      Billing.find({ clientId: { $in: clientIds }, financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
      Payment.find({ clientId: { $in: clientIds }, financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
    ]);
    const billingMap = new Map(billings.map((billing) => [String(billing.clientId), billing]));
    const paymentsMap = new Map<string, Record<string, unknown>[]>();
    paymentsByFy.forEach((payment) => {
      const clientId = String(payment.clientId || "");
      if (!clientId) return;
      const existing = paymentsMap.get(clientId) || [];
      existing.push(payment);
      paymentsMap.set(clientId, existing);
    });
    let rowIdx = 0;
    for (const client of clients) {
      const billing = billingMap.get(client.clientId) || null;
      const payments = paymentsMap.get(client.clientId) || [];
      if (!billing && payments.length === 0) continue;
      const billingPaid = payments.reduce(
        (sum, payment) => sum + (payment.paymentType === "advance" ? 0 : (Number(payment.amountPaid) || 0)),
        0
      );
      const advancePaid = payments.reduce(
        (sum, payment) => sum + (payment.paymentType === "advance" ? (Number(payment.amountPaid) || 0) : 0),
        0
      );
      const totalAmount = Number(billing?.totalAmount) || 0;
      const totalReceived = billingPaid + advancePaid;
      const pending = Math.max(0, totalAmount - billingPaid);
      const status  = totalAmount > 0
        ? (pending <= 0 ? "Paid" : billingPaid > 0 ? "Partial" : "Unpaid")
        : (advancePaid > 0 ? "Advance Only" : billingPaid > 0 ? "Received Without Billing" : "No Billing");
      const row = ws.addRow({ clientId: client.clientId, companyName: client.companyName, category: client.category,
        fy, totalAmount, billingPaid, advancePaid, totalReceived, pending, status });
      applyDataStyle(row, rowIdx++);
      ["totalAmount","billingPaid","advancePaid","totalReceived","pending"].forEach((k) => {
        row.getCell(k).numFmt = INR_NUM_FMT;
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
      const statusColors: Record<string, string> = {
        Paid: "FF16A34A",
        Partial: "FFCA8A04",
        Unpaid: "FFDC2626",
        "Advance Only": "FF2563EB",
        "Received Without Billing": "FF7C3AED",
        "No Billing": "FF64748B",
      };
      if (status in statusColors) row.getCell("status").font = { bold: true, color: { argb: statusColors[status] } };
    }

  // â”€â”€ INVOICES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (type === "invoices") {
    const ws = wb.addWorksheet("Invoice Tracking");
    ws.columns = [
      { header: "Company Name",   key: "companyName",   width: 32 },
      { header: "Client ID",      key: "clientId",      width: 14 },
      { header: "Financial Year", key: "financialYear", width: 14 },
      { header: "From Date",      key: "fromDate",      width: 14 },
      { header: "To Date",        key: "toDate",        width: 14 },
      { header: "Duration (days)",key: "days",          width: 16 },
      { header: "Added On",       key: "createdAt",     width: 14 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const invoices = await Invoice.find({ financialYear: fy }).sort({ fromDate: 1 }).lean() as Record<string,unknown>[];
    const allClients = await Client.find().lean();
    const nameMap: Record<string, string> = {};
    allClients.forEach((c) => { nameMap[c.clientId] = c.companyName; });

    let rowIdx = 0;
    for (const inv of invoices) {
      const days = inclusiveDaySpan(inv.fromDate as string, inv.toDate as string);
      const row = ws.addRow({
        companyName:   nameMap[inv.clientId as string] || inv.clientId,
        clientId:      inv.clientId,
        financialYear: inv.financialYear,
        fromDate:      new Date(inv.fromDate as string).toLocaleDateString("en-IN"),
        toDate:        new Date(inv.toDate as string).toLocaleDateString("en-IN"),
        days,
        createdAt:     new Date(inv.createdAt as string).toLocaleDateString("en-IN"),
      });
      applyDataStyle(row, rowIdx++);
      row.getCell("days").alignment = { horizontal: "center", vertical: "middle" };
    }

  // â”€â”€ UPLOADS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (type === "uploads") {
    const ws = wb.addWorksheet("Upload Records");
    ws.columns = [
      { header: "Company Name",   key: "companyName",   width: 32 },
      { header: "Client ID",      key: "clientId",      width: 14 },
      { header: "Financial Year", key: "financialYear", width: 14 },
      { header: "CAT-I",   key: "cat1",  width: 10 },
      { header: "CAT-II",  key: "cat2",  width: 10 },
      { header: "CAT-III", key: "cat3",  width: 11 },
      { header: "CAT-IV",  key: "cat4",  width: 10 },
      { header: "Total",   key: "total", width: 10 },
      { header: "Added On",key: "createdAt", width: 14 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const uploads = await UploadRecord.find({ financialYear: fy }).sort({ createdAt: -1 }).lean() as Record<string,unknown>[];
    const allClients = await Client.find().lean();
    const nameMap: Record<string, string> = {};
    allClients.forEach((c) => { nameMap[c.clientId] = c.companyName; });

    let rowIdx = 0;
    for (const upl of uploads) {
      const c1 = Number(upl.cat1)||0, c2 = Number(upl.cat2)||0;
      const c3 = Number(upl.cat3)||0, c4 = Number(upl.cat4)||0;
      const row = ws.addRow({
        companyName: nameMap[upl.clientId as string] || upl.clientId,
        clientId: upl.clientId, financialYear: upl.financialYear,
        cat1: c1, cat2: c2, cat3: c3, cat4: c4, total: c1+c2+c3+c4,
        createdAt: new Date(upl.createdAt as string).toLocaleDateString("en-IN"),
      });
      applyDataStyle(row, rowIdx++);
      ["cat1","cat2","cat3","cat4","total"].forEach((k) => {
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(k).numFmt = "#,##0";
      });
    }

  // â”€â”€ ANNUAL RETURN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (type === "annual-return") {
    const ws = wb.addWorksheet("EPR Annual Returns");
    ws.columns = [
      { header: "Client ID",      key: "clientId",          width: 14 },
      { header: "Company Name",   key: "companyName",       width: 32 },
      { header: "Category",       key: "category",          width: 14 },
      { header: "Financial Year", key: "financialYear",     width: 14 },
      { header: "Status",         key: "status",            width: 14 },
      { header: "Filing Date",    key: "filingDate",        width: 14 },
      { header: "Ack. Number",    key: "acknowledgeNumber", width: 24 },
      { header: "Remarks",        key: "remarks",           width: 32 },
      { header: "Last Updated",   key: "updatedAt",         width: 16 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const [returns, allClients] = await Promise.all([
      AnnualReturn.find({ financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
      Client.find().lean(),
    ]);
    const nameMap: Record<string, string> = {};
    const catMap:  Record<string, string> = {};
    allClients.forEach((c) => { nameMap[c.clientId] = c.companyName; catMap[c.clientId] = c.category; });
    const returnMap = new Map(returns.map((ret) => [String(ret.clientId), ret]));
    const statusOrder: Record<string, number> = {
      Pending: 0,
      "In Progress": 1,
      Filed: 2,
      Verified: 3,
    };
    const exportRows = allClients
      .map((client) => {
        const existing = returnMap.get(client.clientId);
        return {
          clientId: client.clientId,
          companyName: client.companyName,
          category: client.category,
          financialYear: fy,
          status: String(existing?.status || "Pending"),
          filingDate: existing?.filingDate ? new Date(existing.filingDate as string).toLocaleDateString("en-IN") : "",
          acknowledgeNumber: String(existing?.acknowledgeNumber || ""),
          remarks: String(existing?.remarks || ""),
          updatedAt: existing?.updatedAt ? new Date(existing.updatedAt as string).toLocaleDateString("en-IN") : "",
        };
      })
      .sort((a, b) => {
        const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return a.companyName.localeCompare(b.companyName);
      });

    let rowIdx = 0;
    for (const ret of exportRows) {
      const row = ws.addRow({
        clientId:          ret.clientId,
        companyName:       nameMap[ret.clientId] || ret.clientId,
        category:          catMap[ret.clientId] || "",
        financialYear:     ret.financialYear,
        status:            ret.status,
        filingDate:        ret.filingDate,
        acknowledgeNumber: ret.acknowledgeNumber,
        remarks:           ret.remarks,
        updatedAt:         ret.updatedAt,
      });
      applyDataStyle(row, rowIdx++);
      const statusColors: Record<string, string> = {
        Filed: "FF16A34A",
        Verified: "FF2563EB",
        "In Progress": "FFCA8A04",
        Pending: "FFDC2626",
      };
      const st = ret.status;
      if (st in statusColors) row.getCell("status").font = { bold: true, color: { argb: statusColors[st] } };
    }
  }

    const buffer = await wb.xlsx.writeBuffer();
    const filePrefix = REPORT_FILE_PREFIX[type];
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filePrefix}-${fy}.xlsx"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/reports/export:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
