import { parseDevice } from "@/lib/device";
import { randomUUID } from "node:crypto";
import { SECURITY_EMAIL_ICONS, type SecurityEmailIconName } from "@/lib/security-email-icons";

export type SecurityNotificationInput = {
  event: string;
  status: "Successful" | "Failed" | "Pending Approval" | "Rejected";
  name?: string;
  email?: string;
  verified: boolean;
  metadata: { ip: string; userAgent: string; location: string; networkNote?: string };
  reason?: string;
  occurredAt: Date | string;
  appUrl?: string;
};
type Copy = { headline: string; description: string; icon: SecurityEmailIconName; action: string; path: string; caution?: boolean; note?: string };
const ACCOUNT_PATH = "/dashboard/settings?tab=access";
const SESSION_PATH = "/dashboard/sessions";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function available(value: unknown) {
  if (typeof value !== "string" || !value.trim() || /^(unknown(?: (?:os|browser|device))?|undefined|null|not detected|location unavailable|device)$/i.test(value.trim())) return "Unavailable";
  return value.trim();
}

/** Presentation mapping only: this never decides whether an event is sent. */
function eventCopy(event: string): Copy {
  const value = event.toLowerCase();
  if (/suspicious|unusual/.test(value)) return { headline: "Unusual sign-in detected", description: "An account signed in from a new device or a different approximate location. Review the details below.", icon: "shieldAlert", action: "Review Active Sessions", path: SESSION_PATH, caution: true };
  if (value.includes("new google account requesting access")) return { headline: "New access request", description: "A Google account is waiting for administrator approval to access NextGen Solutions.", icon: "userShield", action: "Review Access Request", path: ACCOUNT_PATH, note: "Review this request in Access & Users. Approving or rejecting access requires signing in as an administrator." };
  if (value.includes("pending google user")) return { headline: "Access request still pending", description: "A Google account awaiting approval attempted to sign in again. Its access remains pending.", icon: "userShield", action: "Review Access Request", path: ACCOUNT_PATH, note: "Review this request in Access & Users. Approving or rejecting access requires signing in as an administrator." };
  if (/rejected|disabled google/.test(value)) return { headline: "Account access was blocked", description: "A rejected or disabled Google account attempted to sign in. Website access was denied.", icon: "shieldAlert", action: "Review Account Security", path: ACCOUNT_PATH, caution: true };
  if (value.includes("account password changed")) return { headline: "Your password was changed", description: "The account password was updated after verification. Review this change if you do not recognize it.", icon: "lock", action: "Review Account Security", path: ACCOUNT_PATH };
  if (value.includes("account recovery email changed")) return { headline: "Recovery Gmail was changed", description: "The account's recovery and security Gmail was updated after verification.", icon: "mail", action: "Review Account Security", path: ACCOUNT_PATH };
  if (/account (?:email|factor email) changed/.test(value)) return { headline: "Your email was changed", description: "The account email was updated after verification. Review the account details below.", icon: "mail", action: "Review Account Security", path: ACCOUNT_PATH };
  if (value.includes("account twofactor on changed")) return { headline: "Two-factor authentication enabled", description: "Email verification is now required at website login for this account.", icon: "shieldCheck", action: "Review Account Security", path: ACCOUNT_PATH };
  if (value.includes("account twofactor off changed")) return { headline: "Two-factor authentication disabled", description: "Website two-factor authentication was turned off after identity verification.", icon: "shieldAlert", action: "Review Account Security", path: ACCOUNT_PATH, caution: true };
  if (value.includes("account recovery codes changed")) return { headline: "Recovery codes were replaced", description: "A new set of account recovery codes was created. The previous codes no longer work.", icon: "key", action: "Review Account Security", path: ACCOUNT_PATH };
  if (value.includes("recovery code used")) return { headline: "Recovery code used to sign in", description: "An account used a saved recovery code to complete website sign-in.", icon: "key", action: "Review Active Sessions", path: SESSION_PATH };
  if (/failed|unsuccessful/.test(value)) return { headline: "Unsuccessful sign-in attempt", description: "A sign-in or verification attempt was unsuccessful. Review the available request details below.", icon: "shieldAlert", action: "Review Account Security", path: ACCOUNT_PATH, caution: true };
  if (value.includes("google authentication completed")) return { headline: "Google sign-in activity", description: "Google authenticated this account. Website access still follows the account's approval and security settings.", icon: "userShield", action: "Review Account Security", path: ACCOUNT_PATH };
  if (value.includes("successful") && value.includes("login")) return { headline: "New sign-in to your account", description: "A successful sign-in to NextGen Solutions was recorded for the account below.", icon: "shieldCheck", action: "Review Active Sessions", path: SESSION_PATH };
  return { headline: "Account security update", description: "Security activity was recorded for this account. Review the available details below.", icon: "shieldCheck", action: "Review Account Security", path: ACCOUNT_PATH };
}

function actionUrl(base: string | undefined, path: string) {
  if (!base) return "";
  try {
    const url = new URL(base);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    // The configured app origin is the only destination; no event data enters the URL.
    return `${url.origin}${path}`;
  } catch { return ""; }
}

function timeInIndia(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value || "";
  return `${part("day")} ${part("month")} ${part("year")} · ${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()} IST`;
}

export function renderSecurityNotificationEmail(input: SecurityNotificationInput) {
  const copy = eventCopy(input.event);
  const device = parseDevice(input.metadata.userAgent);
  const os = available(device.os), browser = available(device.browser);
  const deviceName = device.type === "unknown" ? "Unavailable" : device.typeLabel;
  const deviceSummary = [os, browser].filter(value => value !== "Unavailable").join(" · ") || "Unavailable";
  const accountName = input.verified ? available(input.name) : "Unverified identity";
  const account = available(input.email);
  const location = available(input.metadata.location), ip = available(input.metadata.ip);
  const time = timeInIndia(input.occurredAt);
  const url = actionUrl(input.appUrl, copy.path);
  const status = input.status === "Pending Approval" ? "Pending approval" : input.status;
  const imageNames = new Set<SecurityEmailIconName>([copy.icon, device.type === "mobile" || device.type === "tablet" ? "mobile" : "desktop", "user", "location", "network", "clock"]);
  const imageId = randomUUID();
  const cid = (name: SecurityEmailIconName) => `${name}.${imageId}@nextgen-security.local`;
  const icon = (name: SecurityEmailIconName, size = 20) => `<img src="cid:${cid(name)}" alt="" aria-hidden="true" width="${size}" height="${size}" border="0" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;" />`;
  const row = (name: SecurityEmailIconName, label: string, primary: string, secondary?: string, last = false) => `<tr>
    <td width="32" valign="top" style="width:32px;padding:${last ? "0" : "0 0 18px"};padding-top:2px;">${icon(name)}</td>
    <td valign="top" style="padding:${last ? "0" : "0 0 18px"};overflow-wrap:anywhere;word-break:break-word;">
      <p style="margin:0 0 3px;color:#5d6977;font-size:12px;line-height:18px;">${escapeHtml(label)}</p>
      <p style="margin:0;color:#202b38;font-size:15px;line-height:22px;font-weight:600;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(primary)}</p>
      ${secondary ? `<p style="margin:2px 0 0;color:#536171;font-size:13px;line-height:20px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(secondary)}</p>` : ""}
    </td>
  </tr>`;
  const safetyNote = copy.note || (copy.caution
    ? "If this activity is unexpected, review the account and its active sessions. Account actions require signing in to NextGen Solutions."
    : "If you recognize this activity, no action is needed. If it looks unfamiliar, review the account and its active sessions.");
  const networkNote = available(input.metadata.networkNote);
  const reason = input.reason === "New browser/device cookie" ? "This browser was not recognized from previous sign-ins." : available(input.reason);
  const text = [
    "NextGen Solutions", "", copy.headline, "", copy.description, "",
    `Event: ${input.event}`, `Status: ${status}`,
    `Account name: ${accountName}`,
    `${input.verified ? "Verified account / login ID" : "Claimed email / login ID (unverified)"}: ${account}`,
    `Device: ${deviceName}`, `OS: ${os}`, `Browser: ${browser}`, `IP: ${ip}`, `Approximate location: ${location}`, `Time: ${time}`,
    ...(reason !== "Unavailable" ? [`Reason: ${reason}`] : []),
    ...(networkNote !== "Unavailable" ? [`Network information: ${networkNote}`] : []),
    "", safetyNote, ...(url ? ["", `${copy.action}: ${url}`] : ["", "Open NextGen Solutions to review Account Security in Settings."]),
    "", "Repeated events of this type are throttled. No login secrets are included.",
    "", "NextGen Solutions", "EPR Consultancy", "New Delhi, India",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
  <title>${escapeHtml(copy.headline)} · NextGen Solutions</title>
  <style>
    table { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:separate; }
    @media only screen and (max-width:588px) {
      .email-page { padding:32px 20px !important; }
      .email-title { font-size:28px !important; line-height:35px !important; }
      .security-card { padding:20px !important; }
      .security-button { display:block !important; text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;color:#202328;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#ffffff;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(copy.headline)}. ${escapeHtml(copy.description)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;">
    <tr><td class="email-page" align="center" style="padding:48px 24px;">
      <!--[if mso]><table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;margin:0 auto;table-layout:fixed;">
        <tr><td align="left" style="padding:0 0 30px;"><p style="margin:0;color:#32637b;font-size:15px;line-height:22px;font-weight:700;">NextGen Solutions</p></td></tr>
        <tr><td align="left" style="padding:0 0 18px;">${icon(copy.icon, 44)}</td></tr>
        <tr><td align="left">
          <h1 class="email-title" style="margin:0 0 14px;color:#202328;font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.6px;">${escapeHtml(copy.headline)}</h1>
          <p style="margin:0;color:#4c5158;font-size:16px;line-height:26px;">${escapeHtml(copy.description)}</p>
        </td></tr>
        <tr><td style="padding:24px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f6fa" style="width:100%;background-color:#f3f6fa;border:1px solid #e4eaf0;border-radius:12px;table-layout:fixed;">
            <tr><td class="security-card" style="padding:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
                <colgroup><col width="32" style="width:32px;" /><col /></colgroup>
                <tr><td colspan="2" style="padding:0 0 20px;"><p style="margin:0;color:${copy.caution ? "#8b4519" : "#32637b"};font-size:11px;line-height:18px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(status)} · Account security</p></td></tr>
                ${row(device.type === "mobile" || device.type === "tablet" ? "mobile" : "desktop", "Device", deviceSummary, deviceName !== "Unavailable" ? deviceName : undefined)}
                ${row("user", input.verified ? "Account" : "Claimed account · Unverified", accountName, account)}
                ${row("location", "Approximate location", location)}
                ${row("network", "IP address", ip)}
                ${row("clock", "Time", time, undefined, true)}
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${reason !== "Unavailable" ? `<tr><td style="padding:18px 0 0;"><p style="margin:0;color:#536171;font-size:13px;line-height:21px;"><strong>Why you received this</strong><br />${escapeHtml(reason)}</p></td></tr>` : ""}
        ${networkNote !== "Unavailable" ? `<tr><td style="padding:14px 0 0;"><p style="margin:0;color:#666c74;font-size:12px;line-height:20px;">${escapeHtml(networkNote)}</p></td></tr>` : ""}
        ${url ? `<tr><td align="left" style="padding:26px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1665d8" style="background-color:#1665d8;border:1px solid #1665d8;border-radius:6px;mso-padding-alt:13px 20px;">
            <a class="security-button" href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;text-decoration:none;border-radius:6px;mso-padding-alt:0;">${escapeHtml(copy.action)}</a>
          </td></tr></table>
        </td></tr>` : ""}
        <tr><td align="left" style="padding:24px 0 28px;"><p style="margin:0;color:#666c74;font-size:13px;line-height:22px;">${escapeHtml(safetyNote)}</p>${!url ? `<p style="margin:8px 0 0;color:#666c74;font-size:13px;line-height:22px;">Open NextGen Solutions to review Account Security in Settings.</p>` : ""}</td></tr>
        <tr><td align="left" style="padding:22px 0 0;border-top:1px solid #e8eaed;color:#72777e;font-size:12px;line-height:20px;">
          <p style="margin:0;color:#555c65;font-weight:700;">NextGen Solutions</p>
          <p style="margin:0;">EPR Consultancy</p>
          <p style="margin:4px 0 0;">New Delhi, India</p>
          <p style="margin:12px 0 0;">Automatic security notification. Repeated activity is throttled.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  const inlineImages = [...imageNames].map(name => ({ filename: `security-${name}.png`, mimeType: "image/png", cid: cid(name), contentBase64: SECURITY_EMAIL_ICONS[name] }));
  return { subject: copy.headline, headline: copy.headline, html, text, inlineImages, actionUrl: url };
}
