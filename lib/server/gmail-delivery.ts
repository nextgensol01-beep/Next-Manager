export type GmailAttachment = { filename: string; mimeType: string; contentBase64: string };

function safeHeader(value: string) { return value.replace(/[\r\n"]/g, "").trim(); }

function rawEmail(to: string[], cc: string[], subject: string, html: string, from: string, attachments: GmailAttachment[]) {
  const mixed = `----=_NextgenMixed_${Date.now()}`;
  const alternative = `----=_NextgenAlternative_${Date.now()}`;
  const lines = [
    `From: "Nextgen Solutions" <${from}>`, `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${mixed}"`, "",
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
    `--${alternative}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 7bit", "", "Please view this email in an HTML-capable email client.", "",
    `--${alternative}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html, "utf-8").toString("base64"), "", `--${alternative}--`,
  ];
  for (const attachment of attachments) lines.push("", `--${mixed}`, `Content-Type: ${safeHeader(attachment.mimeType)}; name="${safeHeader(attachment.filename)}"`, `Content-Disposition: attachment; filename="${safeHeader(attachment.filename)}"`, "Content-Transfer-Encoding: base64", "", attachment.contentBase64);
  lines.push("", `--${mixed}--`);
  return Buffer.from(lines.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store" });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) { const error = new Error(data.error_description || data.error || "Failed to refresh Gmail access token"); if (data.error === "invalid_grant") error.name = "InvalidGrantError"; throw error; }
  return data.access_token;
}

async function defaultSignature(token: string, gmailUser: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(gmailUser)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await response.json() as { signature?: string; error?: { message?: string } };
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

export async function deliverThroughGmail(input: { to: string[]; cc: string[]; subject: string; html: string; attachments?: GmailAttachment[]; mode: "draft" | "send"; signatureGap?: number }) {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  const gmailUser = process.env.GMAIL_USER;
  if (!clientId || !clientSecret || !refreshToken || !gmailUser) throw new Error("Gmail OAuth is not configured.");
  const token = await accessToken(clientId, clientSecret, refreshToken);
  const signature = await defaultSignature(token, gmailUser);
  const raw = rawEmail(input.to, input.cc, input.subject, appendSignature(input.html, signature, input.signatureGap), gmailUser, input.attachments || []);
  // Gmail's two endpoints use different request envelopes: drafts.create wraps
  // the message, while messages.send receives the RFC822 payload directly.
  const payload = input.mode === "send" ? { raw } : { message: { raw } };
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${input.mode === "send" ? "messages/send" : "drafts"}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  const data = await response.json() as { id?: string; threadId?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Gmail rejected the ${input.mode}`);
  return { draftId: data.id || "", threadId: data.threadId || "", draftUrl: input.mode === "draft" && data.id ? `https://mail.google.com/mail/#drafts/${data.id}` : "https://mail.google.com/mail/#drafts" };
}
