export type VerificationEmailBrand = {
  name: string;
  category?: string;
  supportEmail?: string;
  address?: string;
};

export type VerificationEmailInput = {
  verificationCode: string;
  expiryMinutes: number;
  purpose?: string;
  messageCount?: number;
  mode?: "send" | "draft";
  workflowName?: string;
  emailType?: "initial" | "reminder";
  brand?: Partial<VerificationEmailBrand>;
};

const DEFAULT_BRAND: VerificationEmailBrand = {
  name: "NextGen Solutions",
  category: "EPR Consultancy",
  address: "New Delhi, India",
};

// Existing approval purposes map to recipient-facing copy in one place.
const PURPOSE_COPY = {
  "send-pin-update": {
    subject: "Send PIN change verification code",
    headline: "Verify Send PIN change",
    body: "We received a request to change your Email Delivery Send PIN. Use the verification code below to continue.",
  },
  "approval-email-change": {
    subject: "Approval email change verification code",
    headline: "Confirm approval email change",
    body: "We received a request to change your delivery approval email. Use the verification code below to continue.",
  },
  "approval-email-verify": {
    subject: "Approval email verification code",
    headline: "Verify your approval email",
    body: "This code verifies this email address for protected email delivery. Use the verification code below to continue.",
  },
  "settings-update": {
    subject: "Delivery settings verification code",
    headline: "Verify delivery settings",
    body: "We received a request to change your email delivery protection settings. Use the verification code below to continue.",
  },
};

function copyForPurpose(input: VerificationEmailInput) {
  if (input.purpose === "delivery") {
    const count = input.messageCount;
    const emails = typeof count === "number" && Number.isInteger(count) && count > 0
      ? `${count} client ${count === 1 ? "email" : "emails"}`
      : "client emails";
    return input.mode === "draft"
      ? {
          subject: "Gmail draft approval verification code",
          headline: "Approve Gmail drafts",
          body: `We received a request to create Gmail drafts for ${emails}. Use the verification code below to continue.`,
        }
      : {
          subject: "Email delivery verification code",
          headline: "Approve email delivery",
          body: `We received a request to approve the delivery of ${emails}. Use the verification code below to continue.`,
        };
  }
  if (input.purpose && Object.hasOwn(PURPOSE_COPY, input.purpose))
    return PURPOSE_COPY[input.purpose as keyof typeof PURPOSE_COPY];
  return {
    subject: "Security verification code",
    headline: "Your verification code",
    body: "Use the verification code below to securely confirm your request.",
  };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

/** Typography-led security email; the code stays one selectable six-digit string. */
export function renderVerificationEmail(input: VerificationEmailInput) {
  if (!/^\d{6}$/.test(input.verificationCode))
    throw new Error("Verification email requires a six-digit code.");
  if (!Number.isInteger(input.expiryMinutes) || input.expiryMinutes < 1)
    throw new Error("Verification email requires a positive expiry in minutes.");

  const brand = { ...DEFAULT_BRAND, ...input.brand };
  const copy = copyForPurpose(input);
  // Keep codes out of notification subjects, matching the existing security-email behavior.
  const subject = `${brand.name} — ${copy.subject}`;
  const expiry = `This code expires in ${input.expiryMinutes} ${input.expiryMinutes === 1 ? "minute" : "minutes"}.`;
  const securityNote = "If you did not request this action, ignore this email and do not share the code with anyone.";
  const support = brand.supportEmail?.trim();
  if (support && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(support))
    throw new Error("Verification email support address is invalid.");
  const footer = [brand.name, brand.category, brand.address].filter(Boolean);
  // Optional context is operation metadata, never client or recipient lists.
  const summary = input.purpose === "delivery" && input.mode !== "draft" && input.workflowName
    ? [input.workflowName, ...(input.emailType ? [input.emailType === "reminder" ? "Reminder" : "Initial email"] : [])]
    : [];
  const text = [
    brand.name,
    "",
    copy.headline,
    "",
    copy.body,
    "",
    `Your verification code is ${input.verificationCode}.`,
    "",
    expiry,
    ...(summary.length ? ["", "Request details", ...summary] : []),
    "",
    securityNote,
    "",
    ...footer,
    ...(support ? [`Need help? ${support}`] : []),
  ].join("\n");

  // Inline layout works without media queries; the fixed-width MSO wrapper
  // supplies a readable fallback in classic Outlook.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
  <title>${escapeHtml(copy.headline)} · ${escapeHtml(brand.name)}</title>
  <style>
    table { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    @media only screen and (max-width: 588px) {
      .email-page { padding: 32px 24px !important; }
      .email-title { font-size: 28px !important; line-height: 35px !important; }
      .email-code { font-size: 38px !important; letter-spacing: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;color:#202328;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#ffffff;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(copy.headline)}. ${escapeHtml(expiry)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;">
    <tr><td class="email-page" align="center" style="padding:48px 24px;">
      <!--[if mso]><table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;margin:0 auto;">
        <tr><td align="left" style="padding:0 0 32px;">
          <p style="margin:0;color:#32637b;font-size:15px;line-height:22px;font-weight:700;">${escapeHtml(brand.name)}</p>
        </td></tr>
        <tr><td align="left">
          <h1 class="email-title" style="margin:0 0 18px;color:#202328;font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.6px;">${escapeHtml(copy.headline)}</h1>
          <p style="margin:0;color:#4c5158;font-size:16px;line-height:26px;">${escapeHtml(copy.body)}</p>
        </td></tr>
        <tr><td align="left" style="padding:28px 0 0;">
          <p style="margin:0;color:#666c74;font-size:13px;line-height:22px;">Your verification code</p>
          <p class="email-code" data-verification-code style="margin:8px 0 10px;color:#181c20;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:40px;line-height:50px;letter-spacing:8px;white-space:nowrap;"><strong>${input.verificationCode}</strong></p>
          <p style="margin:0;color:#666c74;font-size:13px;line-height:22px;">${escapeHtml(expiry)}</p>
        </td></tr>
        ${summary.length ? `<tr><td align="left" style="padding:24px 0 0;color:#666c74;font-size:13px;line-height:21px;overflow-wrap:anywhere;word-break:break-word;"><p style="margin:0 0 4px;font-weight:700;">Request details</p>${summary.map(value => `<p style="margin:0;">${escapeHtml(value)}</p>`).join("")}</td></tr>` : ""}
        <tr><td align="left" style="padding:28px 0;">
          <p style="margin:0;color:#666c74;font-size:13px;line-height:22px;">${securityNote}</p>
        </td></tr>
        <tr><td align="left" style="padding:22px 0 0;border-top:1px solid #e8eaed;color:#72777e;font-size:12px;line-height:20px;">
          <p style="margin:0;color:#555c65;font-weight:700;">${escapeHtml(brand.name)}</p>
          ${brand.category ? `<p style="margin:0;">${escapeHtml(brand.category)}</p>` : ""}
          ${brand.address ? `<p style="margin:4px 0 0;overflow-wrap:anywhere;">${escapeHtml(brand.address)}</p>` : ""}
          ${support ? `<p style="margin:8px 0 0;">Need help? <a href="mailto:${encodeURIComponent(support)}" style="display:inline-block;padding:4px 0;color:#32637b;text-decoration:underline;">${escapeHtml(support)}</a></p>` : ""}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
