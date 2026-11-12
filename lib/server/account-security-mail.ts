import "server-only";
import { after } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { getRequestIp, hasTrustedProxy } from "@/lib/authUsers";
import { locationFromRequestHeaders } from "@/lib/sessionLocation";
import { renderSecurityNotificationEmail } from "@/lib/security-notification-template";
import { AccountSecurityConfig } from "@/models/AccountSecurity";
import { deliverThroughGmail } from "./gmail-delivery";

export type LoginRequestMetadata = { ip: string; userAgent: string; location: string; networkNote?: string };

function isLocallyHosted() {
  try {
    const host = new URL(process.env.NEXTAUTH_URL || "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch { return false; }
}

export function requestMetadata(headers: Headers): LoginRequestMetadata {
  const ip = getRequestIp(headers);
  return {
    ip,
    userAgent: (headers.get("user-agent") || "").slice(0, 500),
    location: hasTrustedProxy() ? locationFromRequestHeaders(headers) || "Unknown" : "Unknown",
    networkNote: !ip
      ? isLocallyHosted()
        ? "Locally hosted application (localhost): no trusted public client IP or geographic location is available."
        : "Client network details were not supplied by a trusted hosting platform or proxy."
      : undefined,
  };
}
export async function securityEmail() {
  await connectDB();
  const config = await AccountSecurityConfig.findById("primary");
  // Once explicitly verified, the persisted recovery address takes precedence forever.
  return config?.recoveryEmail || process.env.AUTH_SECURITY_EMAIL?.trim().toLowerCase() || process.env.GMAIL_USER?.trim().toLowerCase() || "";
}
type AccountMail = Pick<ReturnType<typeof renderSecurityNotificationEmail>, "subject" | "html" | "text"> & Partial<Pick<ReturnType<typeof renderSecurityNotificationEmail>, "inlineImages">>;

export async function sendAccountMail(to: string, { subject, html, text, inlineImages }: AccountMail) {
  await deliverThroughGmail({ to: [to], cc: [], subject, html, text, inlineImages, mode: "send", appendDefaultSignature: false, signal: AbortSignal.timeout(12_000) });
}
export type SecurityEvent = {
  event: string;
  status: "Successful" | "Failed" | "Pending Approval" | "Rejected";
  name?: string;
  email?: string;
  verified: boolean;
  metadata: ReturnType<typeof requestMetadata>;
  reason?: string;
};

// next/server after keeps work alive on serverless hosts without delaying the response.
export function notifySecurity(event: SecurityEvent, confirmationTo?: string[]) {
  const occurredAt = new Date();
  after(async () => {
    try {
      const { takeSecurityLimit } = await import("./account-security");
      const key = `notice:${event.event}:${event.email || "unknown"}:${event.metadata.ip}`;
      const interval = event.status === "Failed" ? 10 * 60_000 : 60_000;
      const count = await takeSecurityLimit(key, 1, interval);
      if (!confirmationTo?.length && (!count.allowed || !(await takeSecurityLimit("notice-global", 100, 60 * 60_000)).allowed)) return;
      const recipient = await securityEmail();
      const email = renderSecurityNotificationEmail({ ...event, occurredAt, appUrl: process.env.NEXTAUTH_URL });
      for (const to of new Set([recipient, ...(confirmationTo || [])].filter(Boolean))) {
        try { await sendAccountMail(to, { ...email, subject: `NextGen security: ${email.subject}` }); }
        catch { console.warn("Account security notification delivery failed"); }
      }
    } catch { console.warn("Account security notification unavailable"); }
  });
}
