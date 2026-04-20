import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { connectDB } from "@/lib/mongoose";
import EmailLog from "@/models/EmailLog";

function buildRawEmail(
  to: string,
  cc: string[],
  subject: string,
  htmlBody: string,
  fromEmail: string
): string {
  const boundary = "----=_NextPart_" + Date.now();
  const htmlB64 = Buffer.from(htmlBody, "utf-8").toString("base64");

  const headers: string[] = [
    `From: "Nextgen Solutions" <${fromEmail}>`,
    `To: ${to}`,
  ];
  if (cc.length > 0) {
    headers.push(`Cc: ${cc.join(", ")}`);
  }
  headers.push(
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    `Please view this email in an HTML-capable email client.`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlB64,
    ``,
    `--${boundary}--`,
  );

  const mime = headers.join("\r\n");
  return Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { to, subject, html, logClientId, logClientName, logFy } = body;

  if (!to || !subject || !html) {
    return NextResponse.json({ error: "to, subject, and html are required" }, { status: 400 });
  }

  const clientId     = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  const gmailUser    = process.env.GMAIL_USER;

  if (!clientId || !clientSecret || !refreshToken || !gmailUser) {
    return NextResponse.json({
      error: "Gmail OAuth not configured",
      missing: [
        !clientId     && "GMAIL_OAUTH_CLIENT_ID",
        !clientSecret && "GMAIL_OAUTH_CLIENT_SECRET",
        !refreshToken && "GMAIL_OAUTH_REFRESH_TOKEN",
        !gmailUser    && "GMAIL_USER",
      ].filter(Boolean),
    }, { status: 503 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // First recipient → To:, rest → Cc: — creates a single draft
    const toList: string[] = Array.isArray(to) ? to : [to];
    const primaryTo = toList[0];
    const ccList    = toList.slice(1);

    const rawEmail = buildRawEmail(primaryTo, ccList, subject, html, gmailUser);
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: rawEmail } },
    });
    const draftId = draft.data.id || "";

    // Log the draft
    try {
      await connectDB();
      await EmailLog.create({
        type: "annual_return_draft",
        to: toList,
        subject,
        clientId: logClientId || "",
        clientName: logClientName || "",
        financialYear: logFy || "",
        status: "draft",
        notes: `To: ${primaryTo}${ccList.length > 0 ? ` | Cc: ${ccList.join(", ")}` : ""}. Draft ID: ${draftId}`,
      });
    } catch {}

    const draftUrl = draftId
      ? `https://mail.google.com/mail/#drafts/${draftId}`
      : "https://mail.google.com/mail/#drafts";

    return NextResponse.json({ success: true, draftUrl, draftId, primaryTo, ccList });

  } catch (err: unknown) {
    const error = err as { message?: string; code?: number };
    console.error("Gmail draft creation failed:", error);

    if (error?.code === 401 || (error?.message || "").includes("invalid_grant")) {
      return NextResponse.json({
        error: "Gmail OAuth token expired or invalid. Please re-authorise.",
        code: "INVALID_GRANT",
      }, { status: 401 });
    }

    return NextResponse.json({ error: error?.message || "Failed to create draft" }, { status: 500 });
  }
}
