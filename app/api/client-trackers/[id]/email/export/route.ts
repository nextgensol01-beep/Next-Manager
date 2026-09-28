import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import EmailLog from "@/models/EmailLog";
import { finaliseReadableReportSheet } from "@/lib/server/excel-report-style";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!(await isAdminSession(session)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await connectDB();
  const tracker = (await ClientTracker.findById(id)
    .select("name financialYear")
    .lean()) as { name?: string; financialYear?: string } | null;
  if (!tracker)
    return NextResponse.json({ error: "Tracker not found." }, { status: 404 });
  const logs = await EmailLog.find({ trackerId: id })
    .sort({ sentAt: -1, _id: -1 })
    .lean();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nextgen Solutions";
  const sheet = workbook.addWorksheet("Email history");
  sheet.addRow([
    "Date and time",
    "Client",
    "Client ID",
    "Workflow ID",
    "Email type",
    "Status",
    "Reply status",
    "To",
    "CC",
    "Subject",
    "Attachments",
    "Gmail ID",
    "Campaign ID",
    "Notes",
  ]);
  logs.forEach((log) => {
    sheet.addRow([
      log.sentAt instanceof Date ? log.sentAt : new Date(log.sentAt),
      log.clientName || "",
      log.clientId || "",
      log.workflowId || "",
      log.mailKind === "reminder" ? "Reminder" : "Initial",
      log.status || "",
      log.communicationStatus === "replied" ? "Replied" : "No reply recorded",
      (log.to || []).join(", "),
      (log.cc || []).join(", "),
      log.subject || "",
      (
        (log.attachments || []) as Array<{ filename?: string }>
      )
        .map((item) => item.filename || "")
        .filter(Boolean)
        .join(", "),
      log.gmailMessageId || "",
      log.campaignId || "",
      log.notes || "",
    ]);
  });
  sheet.getColumn(1).numFmt = "dd-mmm-yyyy hh:mm";
  [1, 2, 3, 5, 6, 7].forEach((index) => {
    sheet.getColumn(index).width = 20;
  });
  [4, 8, 9, 10, 11, 12, 13, 14].forEach((index) => {
    sheet.getColumn(index).width = 32;
  });
  finaliseReadableReportSheet(sheet, { freezeColumns: 3 });
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = String(tracker.name || "client-tracker")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName || "client-tracker"}-email-history.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
