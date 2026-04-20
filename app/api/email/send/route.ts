import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/utils/email";
import { connectDB } from "@/lib/mongoose";
import EmailLog from "@/models/EmailLog";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { to, subject, message, quotationHtml, reminderHtml,
          logType, logClientId, logClientName, logFy } = body;

  if (!to || !subject) {
    return NextResponse.json({ error: "to and subject are required" }, { status: 400 });
  }

  let html: string;

  if (quotationHtml) {
    // Template is fully self-contained with its own outer table wrapper
    html = quotationHtml;
  } else if (reminderHtml) {
    html = reminderHtml;
  } else {
    html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:#fff;padding:28px 24px;text-align:center;">
        <h1 style="margin:0;font-size:22px;font-weight:800;">Nextgen Solutions</h1>
        <p style="margin:6px 0 0;opacity:0.75;font-size:13px;">EPR Consultancy</p>
      </div>
      <div style="padding:28px 24px;background:#fff;">${(message || "").replace(/\n/g, "<br/>")}</div>
      <div style="background:#f9fafb;padding:14px;text-align:center;color:#9ca3af;font-size:12px;">
        Nextgen Solutions | EPR Consultancy
      </div>
    </div>`;
  }

  const result = await sendEmail({ to, subject, html });

  // Log the email
  try {
    await connectDB();
    await EmailLog.create({
      type: logType || (quotationHtml ? "quotation" : reminderHtml ? "payment_reminder" : "custom"),
      to: Array.isArray(to) ? to : [to],
      subject,
      clientId: logClientId || "",
      clientName: logClientName || "",
      financialYear: logFy || "",
      status: result.success ? "sent" : "failed",
    });
  } catch { /* logging failure should not break the main flow */ }

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: result.message });
}
