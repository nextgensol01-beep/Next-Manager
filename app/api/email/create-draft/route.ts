import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  logType: z.enum(["quotation", "payment_reminder", "annual_return_draft", "custom", "tracker"]).default("annual_return_draft"),
  logClientId: z.string().trim().max(120).optional(),
  logClientName: z.string().trim().max(200).optional(),
  logFy: z.string().trim().max(20).optional(),
  trackerId: z.string().trim().max(80).optional(),
  workflowId: z.string().trim().max(80).optional(),
  mailKind: z.enum(["initial", "reminder"]).optional(),
  mode: z.enum(["draft", "send"]).default("draft"),
});

type DraftAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n"]/g, "").trim();
}

/** Keep the Gmail signature inside the same document as the generated body. */
function appendGmailSignature(html: string, signature: string) {
  if (!signature) return html;
  const replacement = `<br><br>${signature}</body></html>`;
  return /<\/body>\s*<\/html>\s*$/i.test(html)
    ? html.replace(/<\/body>\s*<\/html>\s*$/i, replacement)
    : `${html}<br><br>${signature}`;
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

async function getGmailAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok || !tokenData.access_token) {
    const error = new Error(tokenData.error_description || tokenData.error || "Failed to refresh Gmail access token");
    if (tokenData.error === "invalid_grant") error.name = "InvalidGrantError";
    throw error;
  }
  return tokenData.access_token;
}

async function getGmailDefaultSignature(accessToken: string, gmailUser: string) {
  const signatureResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(gmailUser)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const signatureData = await signatureResponse.json() as { signature?: string; error?: { message?: string } };
  if (!signatureResponse.ok) {
    throw new Error(signatureData.error?.message || "Unable to read the Gmail default signature. Reconnect Gmail to grant signature access.");
  }
  return typeof signatureData.signature === "string" ? signatureData.signature.trim() : "";
}

async function createGmailDelivery(
  accessToken: string,
  rawEmail: string,
  mode: "draft" | "send",
) {
  const draftResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${mode === "send" ? "messages/send" : "drafts"}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    // Gmail's send endpoint accepts { raw }; the drafts endpoint accepts
    // { message: { raw } }. Sending draft-shaped data causes a 400 error.
    body: JSON.stringify(mode === "send" ? { raw: rawEmail } : { message: { raw: rawEmail } }),
    cache: "no-store",
  });
  const draftData = await draftResponse.json() as { id?: string; error?: { message?: string } };
  if (!draftResponse.ok) {
    throw new Error(draftData.error?.message || `Gmail rejected the ${mode}`);
  }
  return draftData.id || "";
}

async function logDelivery(input: {
  logType: "quotation" | "payment_reminder" | "annual_return_draft" | "custom" | "tracker";
  toList: string[];
  ccList: string[];
  subject: string;
  logClientId?: string;
  logClientName?: string;
  logFy?: string;
  draftId: string;
  mode: "draft" | "send";
  trackerId?: string;
  workflowId?: string;
  mailKind?: "initial" | "reminder";
}) {
  try {
    await connectDB();
    await EmailLog.create({
      type: input.logType,
      to: input.toList,
      subject: input.subject,
      clientId: input.logClientId || "",
      clientName: input.logClientName || "",
      financialYear: input.logFy || "",
      status: input.mode === "send" ? "sent" : "draft",
      trackerId: input.trackerId || "",
      workflowId: input.workflowId || "",
      mailKind: input.mailKind || "initial",
      notes: `To: ${input.toList.join(", ")}${input.ccList.length > 0 ? ` | Cc: ${input.ccList.join(", ")}` : ""}. ${input.mode === "send" ? "Message" : "Draft"} ID: ${input.draftId}`,
    });
  } catch (error) {
    console.error("Failed to log Gmail delivery:", error);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = createDraftSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }
  const { to, cc, subject, html, attachments = [], logType, logClientId, logClientName, logFy, trackerId, workflowId, mailKind, mode } = parsedBody.data;

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
    // Keep all To recipients in the To header; CC contains only explicit CC entries.
    const toList: string[] = Array.isArray(to) ? to : [to];
    const explicitCcList: string[] = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const ccList = Array.from(new Set(explicitCcList))
      .filter(email => !toList.includes(email));

    const accessToken = await getGmailAccessToken(clientId, clientSecret, refreshToken);
    const defaultSignature = await getGmailDefaultSignature(accessToken, gmailUser);
    const htmlWithSignature = appendGmailSignature(html, defaultSignature);
    const rawEmail = buildRawEmail(toList, ccList, subject, htmlWithSignature, gmailUser, attachments);
    const draftId = await createGmailDelivery(accessToken, rawEmail, mode);

    after(logDelivery({
      logType,
      toList,
      ccList,
      subject,
      logClientId,
      logClientName,
      logFy,
      draftId,
      mode,
      trackerId,
      workflowId,
      mailKind,
    }));

    const draftUrl = mode === "draft" && draftId
      ? `https://mail.google.com/mail/#drafts/${draftId}`
      : "https://mail.google.com/mail/#drafts";

    return NextResponse.json({ success: true, mode, draftUrl, draftId, toList, ccList });

  } catch (err: unknown) {
    const error = err as { message?: string; name?: string };
    console.error("Gmail draft creation failed:", error);

    if (error?.name === "InvalidGrantError" || (error?.message || "").includes("invalid_grant")) {
      return NextResponse.json({
        error: "Gmail OAuth token expired or invalid. Please re-authorise.",
        code: "INVALID_GRANT",
      }, { status: 401 });
    }

    return NextResponse.json({ error: error?.message || "Failed to create draft" }, { status: 500 });
  }
}
