import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { connectDB } from "@/lib/mongoose";
import EmailLog from "@/models/EmailLog";
import { z } from "zod";

const createDraftSchema = z.object({
  to: z.union([z.string().trim().email(), z.array(z.string().trim().email()).min(1)]),
  cc: z.union([z.string().trim().email(), z.array(z.string().trim().email()).min(1)]).optional(),
  subject: z.string().trim().min(1).max(200),
  html: z.string().min(1),
  attachments: z.array(z.object({
    filename: z.string().trim().min(1).max(180),
    mimeType: z.string().trim().min(1).max(120),
    contentBase64: z.string().min(1),
  })).max(5).optional(),
  logType: z.enum(["quotation", "payment_reminder", "annual_return_draft", "custom"]).default("annual_return_draft"),
  logClientId: z.string().trim().max(120).optional(),
  logClientName: z.string().trim().max(200).optional(),
  logFy: z.string().trim().max(20).optional(),
});

type DraftAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n"]/g, "").trim();
}

function buildRawEmail(
  to: string[],
  cc: string[],
  subject: string,
  htmlBody: string,
  fromEmail: string,
  attachments: DraftAttachment[]
): string {
  const mixedBoundary = "----=_NextgenMixed_" + Date.now();
  const alternativeBoundary = "----=_NextgenAlternative_" + Date.now();
  const htmlB64 = Buffer.from(htmlBody, "utf-8").toString("base64");

  const headers: string[] = [
    `From: "Nextgen Solutions" <${fromEmail}>`,
    `To: ${to.join(", ")}`,
  ];
  if (cc.length > 0) {
    headers.push(`Cc: ${cc.join(", ")}`);
  }
  headers.push(
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    ``,
    `--${alternativeBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    `Please view this email in an HTML-capable email client.`,
    ``,
    `--${alternativeBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlB64,
    ``,
    `--${alternativeBoundary}--`,
  );

  for (const attachment of attachments) {
    const filename = sanitizeHeaderValue(attachment.filename);
    headers.push(
      ``,
      `--${mixedBoundary}`,
      `Content-Type: ${sanitizeHeaderValue(attachment.mimeType)}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      attachment.contentBase64,
    );
  }

  headers.push(``, `--${mixedBoundary}--`);

  const mime = headers.join("\r\n");
  return Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = createDraftSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }
  const { to, cc, subject, html, attachments = [], logType, logClientId, logClientName, logFy } = parsedBody.data;

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

    // Keep all To recipients in the To header; CC contains only explicit CC entries.
    const toList: string[] = Array.isArray(to) ? to : [to];
    const explicitCcList: string[] = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const ccList = Array.from(new Set(explicitCcList))
      .filter(email => !toList.includes(email));

    const rawEmail = buildRawEmail(toList, ccList, subject, html, gmailUser, attachments);
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: rawEmail } },
    });
    const draftId = draft.data.id || "";

    // Log the draft
    try {
      await connectDB();
      await EmailLog.create({
        type: logType,
        to: toList,
        subject,
        clientId: logClientId || "",
        clientName: logClientName || "",
        financialYear: logFy || "",
        status: "draft",
        notes: `To: ${toList.join(", ")}${ccList.length > 0 ? ` | Cc: ${ccList.join(", ")}` : ""}. Draft ID: ${draftId}`,
      });
    } catch {}

    const draftUrl = draftId
      ? `https://mail.google.com/mail/#drafts/${draftId}`
      : "https://mail.google.com/mail/#drafts";

    return NextResponse.json({ success: true, draftUrl, draftId, toList, ccList });

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
