import { readJsonResponse } from "@/lib/http-response";
import { deliveryMemory } from "./email-delivery-memory";
export type GmailAttachment = { filename: string; mimeType: string; content?: Buffer; contentBase64?: string };
export class GmailDeliveryError extends Error {
  constructor(message: string, public mayHaveDelivered: boolean) { super(message); }
}

function safeHeader(value: string) { return value.replace(/[\r\n"]/g, "").trim(); }

function* mimeParts(to: string[], cc: string[], subject: string, html: string, from: string, attachments: GmailAttachment[], text?: string): Generator<Buffer> {
  const mixed = `----=_NextgenMixed_${Date.now()}`;
  const alternative = `----=_NextgenAlternative_${Date.now()}`;
  const lines = [
    `From: "Nextgen Solutions" <${from}>`, `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${mixed}"`, "",
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
    `--${alternative}`, "Content-Type: text/plain; charset=UTF-8", `Content-Transfer-Encoding: ${text !== undefined ? "base64" : "7bit"}`, "", text !== undefined ? Buffer.from(text, "utf-8").toString("base64") : "Please view this email in an HTML-capable email client.", "",
    `--${alternative}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html, "utf-8").toString("base64"), "", `--${alternative}--`,
  ];
  yield Buffer.from(lines.join("\r\n"));
  for (const attachment of attachments) {
    yield Buffer.from(["", `--${mixed}`, `Content-Type: ${safeHeader(attachment.mimeType)}; name="${safeHeader(attachment.filename)}"`, `Content-Disposition: attachment; filename="${safeHeader(attachment.filename)}"`, "Content-Transfer-Encoding: base64", "", ""].join("\r\n"));
    if (attachment.content) {
      // Multiples of three keep Base64 chunk boundaries exact, with bounded scratch space.
      for (let at = 0; at < attachment.content.length; at += 48 * 1024)
        yield Buffer.from(attachment.content.subarray(at, at + 48 * 1024).toString("base64"), "ascii");
    } else {
      const encoded = attachment.contentBase64 || "";
      for (let at = 0; at < encoded.length; at += 64 * 1024)
        yield Buffer.from(encoded.slice(at, at + 64 * 1024), "ascii");
    }
  }
  yield Buffer.from(`\r\n--${mixed}--`);
}

/** Stream one Gmail JSON envelope with backpressure, without a full MIME/raw/JSON copy. */
function gmailBody(parts: Generator<Buffer>, mode: "draft" | "send", signal?: AbortSignal) {
  function* encode(): Generator<Uint8Array> {
    yield Buffer.from(mode === "send" ? '{"raw":"' : '{"message":{"raw":"');
    let carry: Buffer = Buffer.alloc(0);
    for (const part of parts) {
      signal?.throwIfAborted();
      const bytes = carry.length ? Buffer.concat([carry, part]) : part;
      const length = bytes.length - bytes.length % 3;
      if (length) yield Buffer.from(bytes.subarray(0, length).toString("base64url"), "ascii");
      // Copy at most two bytes; don't retain a large prior chunk through a subarray.
      carry = Buffer.from(bytes.subarray(length));
    }
    if (carry.length) yield Buffer.from(carry.toString("base64url"), "ascii");
    yield Buffer.from(mode === "send" ? '"}' : '"}}');
    deliveryMemory("mime.encode.after");
  }
  const encoded = encode();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        const next = encoded.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) { encoded.return(undefined); parts.return(undefined); controller.error(error); }
    },
    cancel() { encoded.return(undefined); parts.return(undefined); },
  });
}

async function accessToken(clientId: string, clientSecret: string, refreshToken: string, signal?: AbortSignal) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store", signal });
  const data = await readJsonResponse(response) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) { const error = new Error(data.error_description || data.error || "Failed to refresh Gmail access token"); if (data.error === "invalid_grant") error.name = "InvalidGrantError"; throw error; }
  return data.access_token;
}

async function defaultSignature(token: string, gmailUser: string, signal?: AbortSignal) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(gmailUser)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  const data = await readJsonResponse(response) as { signature?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Unable to read the Gmail default signature. Reconnect Gmail to grant signature access.");
  return data.signature?.trim() || "";
}

function appendSignature(html: string, signature: string, signatureGap = 2) {
  if (!signature) return html;
  const gap = "<br>".repeat(Math.max(0, Math.min(6, Math.round(signatureGap))));
  return /<\/body>\s*<\/html>\s*$/i.test(html)
    ? html.replace(/<\/body>\s*<\/html>\s*$/i, `${gap}${signature}</body></html>`)
    : `${html}${gap}${signature}`;
}

export async function deliverThroughGmail(input: { to: string[]; cc: string[]; subject: string; html: string; text?: string; attachments?: GmailAttachment[]; mode: "draft" | "send"; signatureGap?: number; appendDefaultSignature?: boolean; signal?: AbortSignal }) {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  const gmailUser = process.env.GMAIL_USER;
  if (!clientId || !clientSecret || !refreshToken || !gmailUser) throw new Error("Gmail OAuth is not configured.");
  const token = await accessToken(clientId, clientSecret, refreshToken, input.signal);
  const signature = input.appendDefaultSignature === false ? "" : await defaultSignature(token, gmailUser, input.signal);
  deliveryMemory("mime.encode.before");
  const parts = mimeParts(input.to, input.cc, input.subject, appendSignature(input.html, signature, input.signatureGap), gmailUser, input.attachments || [], input.text);
  // Gmail's two endpoints use different request envelopes: drafts.create wraps
  // the message, while messages.send receives the RFC822 payload directly.
  const body = gmailBody(parts, input.mode, input.signal);
  const options: RequestInit & { duplex: "half" } = { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body, duplex: "half", cache: "no-store", signal: input.signal };
  let response: Response;
  deliveryMemory("gmail.send.before");
  try { response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${input.mode === "send" ? "messages/send" : "drafts"}`, options); }
  catch { throw new GmailDeliveryError("Gmail delivery status could not be confirmed. Review Gmail before retrying this recipient.", true); }
  finally { parts.return(undefined); if (!body.locked) await body.cancel(); deliveryMemory("gmail.send.after"); }
  let data: { id?: string; threadId?: string; error?: { message?: string } };
  try { data = await readJsonResponse(response); }
  catch { throw new GmailDeliveryError("Gmail delivery status could not be confirmed.", true); }
  if (!response.ok) throw new GmailDeliveryError(data.error?.message || `Gmail rejected the ${input.mode}`, response.status >= 500);
  if (!data.id) throw new GmailDeliveryError("Gmail did not return a delivery identifier. Review Gmail before retrying this recipient.", true);
  return { draftId: data.id || "", threadId: data.threadId || "", draftUrl: input.mode === "draft" && data.id ? `https://mail.google.com/mail/#drafts/${data.id}` : "https://mail.google.com/mail/#drafts" };
}
