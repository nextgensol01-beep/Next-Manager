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

// Read a field from a mongoose lean object — tries canonical name first, then legacy
function fyField(rec: Record<string, unknown> | null, canonical: string, legacy: string): number {
  if (!rec) return 0;
  const cv = Number(rec[canonical]);
  if (!isNaN(cv) && cv > 0) return cv;
  const lv = Number(rec[legacy]);
  return isNaN(lv) ? 0 : lv;
}

// Read qty from a credit transaction — prefers cat1Qty if >0, else cat1 (legacy)
function txCatQty(tx: Record<string, unknown>, i: number): number {
  const canonical = Number(tx[`cat${i}Qty`]);
  if (!isNaN(canonical) && canonical > 0) return canonical;
  const legacy = Number(tx[`cat${i}`]);
  return isNaN(legacy) ? 0 : legacy;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "targets";
  const fy   = searchParams.get("fy")   || "2024-25";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Nextgen Solutions ERP";
  wb.created = new Date();

  // ── TARGETS (PIBO: Producer / Importer / Brand Owner) ──────────────────
  if (type === "targets") {
    const ws = wb.addWorksheet("Targets");
    ws.columns = [
      { header: "Client ID",       key: "clientId",      width: 14 },
      { header: "Company Name",    key: "companyName",   width: 32 },
      { header: "Category",        key: "category",      width: 14 },
      { header: "FY",              key: "fy",            width: 10 },
      { header: "Target CAT-I",    key: "tcat1",         width: 14 },
      { header: "Target CAT-II",   key: "tcat2",         width: 14 },
      { header: "Target CAT-III",  key: "tcat3",         width: 15 },
      { header: "Target CAT-IV",   key: "tcat4",         width: 14 },
      { header: "Total Target",    key: "totalTarget",   width: 14 },
      { header: "Achieved CAT-I",  key: "acat1",         width: 15 },
      { header: "Achieved CAT-II", key: "acat2",         width: 15 },
      { header: "Achieved CAT-III",key: "acat3",         width: 16 },
      { header: "Achieved CAT-IV", key: "acat4",         width: 15 },
      { header: "Total Achieved",  key: "totalAchieved", width: 15 },
      { header: "Remaining",       key: "remaining",     width: 13 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const clients = await Client.find({ category: { $in: ["Producer", "Importer", "Brand Owner"] } }).lean();
    clients.forEach(async (_, idx) => { /* pre-size */ void idx; });

    let rowIdx = 0;
    for (const client of clients) {
      const fyRec = await FinancialYear.findOne({ clientId: client.clientId, financialYear: fy }).lean() as Record<string, unknown> | null;
      const txTo  = await CreditTransaction.find({ toClientId: client.clientId, financialYear: fy }).lean() as Record<string, unknown>[];

      // Targets: canonical cat1Target, fallback to legacy targetCat1
      const tcat = [1,2,3,4].map((i) => fyField(fyRec, `cat${i}Target`, `targetCat${i}`));
      // Achieved: sum from incoming transactions, prefer cat1Qty over cat1
      const acat = [1,2,3,4].map((i) => txTo.reduce((s, t) => s + txCatQty(t, i), 0));

      const totalTarget   = tcat.reduce((a, b) => a + b, 0);
      const totalAchieved = acat.reduce((a, b) => a + b, 0);
      const remaining     = totalTarget - totalAchieved;

      const row = ws.addRow({
        clientId: client.clientId, companyName: client.companyName, category: client.category, fy,
        tcat1: tcat[0], tcat2: tcat[1], tcat3: tcat[2], tcat4: tcat[3], totalTarget,
        acat1: acat[0], acat2: acat[1], acat3: acat[2], acat4: acat[3], totalAchieved, remaining,
      });
      applyDataStyle(row, rowIdx++);

      // Colour remaining: 0 = green (fully achieved), >0 = orange (still pending)
      const remCell = row.getCell("remaining");
      remCell.font = { bold: remaining === 0, color: { argb: remaining === 0 ? "FF16A34A" : remaining < 0 ? "FF2563EB" : "FFEA580C" } };
      remCell.alignment = { horizontal: "right", vertical: "middle" };

      // Right-align numeric columns
      ["tcat1","tcat2","tcat3","tcat4","totalTarget","acat1","acat2","acat3","acat4","totalAchieved","remaining"].forEach((k) => {
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
    }

  // ── PWP CREDITS ────────────────────────────────────────────────────────
  } else if (type === "pwp") {
    const ws = wb.addWorksheet("PWP Credits");
    ws.columns = [
      { header: "Client ID",      key: "clientId",     width: 14 },
      { header: "Company Name",   key: "companyName",  width: 32 },
      { header: "FY",             key: "fy",           width: 10 },
      { header: "Credits CAT-I",  key: "ccat1",        width: 14 },
      { header: "Credits CAT-II", key: "ccat2",        width: 14 },
      { header: "Credits CAT-III",key: "ccat3",        width: 15 },
      { header: "Credits CAT-IV", key: "ccat4",        width: 14 },
      { header: "Total Credits",  key: "totalCredits", width: 14 },
      { header: "Sold CAT-I",     key: "ucat1",        width: 12 },
      { header: "Sold CAT-II",    key: "ucat2",        width: 12 },
      { header: "Sold CAT-III",   key: "ucat3",        width: 13 },
      { header: "Sold CAT-IV",    key: "ucat4",        width: 12 },
      { header: "Total Sold",     key: "totalUsed",    width: 12 },
      { header: "Remaining",      key: "remaining",    width: 12 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const clients = await Client.find({ category: "PWP" }).lean();
    let rowIdx = 0;
    for (const client of clients) {
      const fyRec  = await FinancialYear.findOne({ clientId: client.clientId, financialYear: fy }).lean() as Record<string, unknown> | null;
      const txFrom = await CreditTransaction.find({ fromClientId: client.clientId, financialYear: fy }).lean() as Record<string, unknown>[];

      // Credits generated: canonical cat1Generated, fallback to legacy creditsCat1
      const ccat = [1,2,3,4].map((i) => fyField(fyRec, `cat${i}Generated`, `creditsCat${i}`));
      // Sold: sum from outgoing transactions
      const ucat = [1,2,3,4].map((i) => txFrom.reduce((s, t) => s + txCatQty(t, i), 0));

      const totalCredits = ccat.reduce((a, b) => a + b, 0);
      const totalUsed    = ucat.reduce((a, b) => a + b, 0);
      const remaining    = totalCredits - totalUsed;

      const row = ws.addRow({
        clientId: client.clientId, companyName: client.companyName, fy,
        ccat1: ccat[0], ccat2: ccat[1], ccat3: ccat[2], ccat4: ccat[3], totalCredits,
        ucat1: ucat[0], ucat2: ucat[1], ucat3: ucat[2], ucat4: ucat[3], totalUsed, remaining,
      });
      applyDataStyle(row, rowIdx++);

      // PWP: remaining > 0 = green (credits available), 0 = amber, <0 = red (oversold)
      const remCell = row.getCell("remaining");
      remCell.font = { bold: true, color: { argb: remaining > 0 ? "FF16A34A" : remaining === 0 ? "FFCA8A04" : "FFDC2626" } };
      remCell.alignment = { horizontal: "right", vertical: "middle" };

      ["ccat1","ccat2","ccat3","ccat4","totalCredits","ucat1","ucat2","ucat3","ucat4","totalUsed","remaining"].forEach((k) => {
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
    }

  // ── TRANSACTIONS ───────────────────────────────────────────────────────
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
      row.getCell("totalAmount").numFmt = "₹#,##0";
      ["rateCat1","rateCat2","rateCat3","rateCat4"].forEach((k) => { row.getCell(k).numFmt = "₹#,##0"; });
    }

  // ── PAYMENTS ───────────────────────────────────────────────────────────
  } else if (type === "payments") {
    const ws = wb.addWorksheet("Outstanding Payments");
    ws.columns = [
      { header: "Client ID",    key: "clientId",    width: 14 },
      { header: "Company Name", key: "companyName", width: 32 },
      { header: "Category",     key: "category",    width: 14 },
      { header: "FY",           key: "fy",          width: 10 },
      { header: "Total Billed", key: "totalAmount", width: 14 },
      { header: "Total Paid",   key: "totalPaid",   width: 13 },
      { header: "Pending",      key: "pending",     width: 13 },
      { header: "Status",       key: "status",      width: 10 },
    ];
    applyHeaderStyle(ws.getRow(1));

    const clients = await Client.find().lean();
    let rowIdx = 0;
    for (const client of clients) {
      const billing = await Billing.findOne({ clientId: client.clientId, financialYear: fy }).lean() as Record<string,unknown> | null;
      if (!billing) continue;
      const payments = await Payment.find({ clientId: client.clientId, financialYear: fy }).lean() as Record<string,unknown>[];
      const totalPaid = payments.reduce((s, p) => s + (Number(p.amountPaid) || 0), 0);
      const totalAmount = Number(billing.totalAmount) || 0;
      const pending = totalAmount - totalPaid;
      const status  = pending <= 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Unpaid";
      const row = ws.addRow({ clientId: client.clientId, companyName: client.companyName, category: client.category,
        fy, totalAmount, totalPaid, pending, status });
      applyDataStyle(row, rowIdx++);
      ["totalAmount","totalPaid","pending"].forEach((k) => {
        row.getCell(k).numFmt = "₹#,##0";
        row.getCell(k).alignment = { horizontal: "right", vertical: "middle" };
      });
      const statusColors: Record<string, string> = { Paid: "FF16A34A", Partial: "FFCA8A04", Unpaid: "FFDC2626" };
      if (status in statusColors) row.getCell("status").font = { bold: true, color: { argb: statusColors[status] } };
    }

  // ── INVOICES ───────────────────────────────────────────────────────────
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
      const days = Math.ceil((new Date(inv.toDate as string).getTime() - new Date(inv.fromDate as string).getTime()) / 86400000);
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

  // ── UPLOADS ────────────────────────────────────────────────────────────
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

  // ── ANNUAL RETURN ──────────────────────────────────────────────────────
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

    const returns = await AnnualReturn.find({ financialYear: fy }).sort({ status: 1 }).lean() as Record<string,unknown>[];
    const allClients = await Client.find().lean();
    const nameMap: Record<string, string> = {};
    const catMap:  Record<string, string> = {};
    allClients.forEach((c) => { nameMap[c.clientId] = c.companyName; catMap[c.clientId] = c.category; });

    let rowIdx = 0;
    for (const ret of returns) {
      const row = ws.addRow({
        clientId:          ret.clientId,
        companyName:       nameMap[ret.clientId as string] || ret.clientId,
        category:          catMap[ret.clientId  as string] || "",
        financialYear:     ret.financialYear,
        status:            ret.status,
        filingDate:        ret.filingDate ? new Date(ret.filingDate as string).toLocaleDateString("en-IN") : "",
        acknowledgeNumber: ret.acknowledgeNumber || "",
        remarks:           ret.remarks || "",
        updatedAt:         new Date(ret.updatedAt as string).toLocaleDateString("en-IN"),
      });
      applyDataStyle(row, rowIdx++);
      const statusColors: Record<string, string> = { Filed: "FF16A34A", "In Progress": "FFCA8A04", Pending: "FFDC2626" };
      const st = ret.status as string;
      if (st in statusColors) row.getCell("status").font = { bold: true, color: { argb: statusColors[st] } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${type}-${fy}.xlsx"`,
    },
  });
}
