// Auto-generated: HTML templates inlined to avoid fs.readFileSync on Vercel serverless
// Edit the source files in /templates/ then re-run scripts/inline-templates.ts

export const PAYMENT_REMINDER = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Payment Reminder — {{clientName}}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 60%,#3b82f6 100%);padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:32px 36px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Nextgen Solutions</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:3px;">EPR Consultancy Services</div>
                </td>
                <td align="right">
                  <table cellpadding="0" cellspacing="0">
                    <tr><td style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 16px;text-align:center;">
                      <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;font-weight:600;">Payment</div>
                      <div style="font-size:18px;font-weight:800;color:#fff;">Reminder</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Orange accent bar -->
        <tr><td style="background:linear-gradient(90deg,#f59e0b,#fbbf24);height:4px;"></td></tr>
      </table>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:32px 36px 0;">
      <p style="margin:0;font-size:15px;color:#374151;">Dear <strong style="color:#0f172a;">{{clientName}}</strong>,</p>
      <p style="margin:12px 0 0;font-size:14px;color:#6b7280;line-height:1.7;">
        We hope you are doing well. This is a friendly reminder regarding your outstanding payment for
        EPR compliance services for <strong style="color:#1e40af;">FY {{financialYear}}</strong>.
      </p>
    </td>
  </tr>

  <!-- AMOUNT DUE HIGHLIGHT -->
  <tr>
    <td style="padding:24px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;border:1px solid #bfdbfe;">
        <tr>
          <td style="padding:20px 24px;" align="center">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#3b82f6;margin-bottom:6px;">Amount Due</div>
            <div style="font-size:36px;font-weight:900;color:#1e3a8a;letter-spacing:-1px;">₹{{pendingAmount}}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Financial Year {{financialYear}}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BILLING BREAKDOWN -->
  <tr>
    <td style="padding:24px 36px 0;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:12px;">Billing Summary</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        {{breakdownRows}}
        <!-- Divider -->
        <tr><td colspan="2" style="padding:4px 0;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:4px 0;" /></td></tr>
        <!-- Total Billed -->
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;">Total Billed</td>
          <td style="padding:8px 12px;font-size:13px;color:#0f172a;font-weight:700;text-align:right;">₹{{totalAmount}}</td>
        </tr>
        <!-- Paid -->
        <tr style="background:#f0fdf4;border-radius:6px;">
          <td style="padding:8px 12px;font-size:13px;color:#15803d;">Amount Paid</td>
          <td style="padding:8px 12px;font-size:13px;color:#15803d;font-weight:700;text-align:right;">₹{{totalPaid}}</td>
        </tr>
        <!-- Pending -->
        <tr style="background:#fef2f2;">
          <td style="padding:10px 12px;font-size:14px;color:#dc2626;font-weight:700;">Pending Amount</td>
          <td style="padding:10px 12px;font-size:15px;color:#dc2626;font-weight:800;text-align:right;">₹{{pendingAmount}}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA MESSAGE -->
  <tr>
    <td style="padding:24px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
            Kindly arrange the payment at your earliest convenience. If you have already made the payment, please ignore this reminder or send us the transaction details.
          </p>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- SIGN OFF -->
  <tr>
    <td style="padding:28px 36px 0;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
        Thank you for your continued trust in us.<br/>
        For any queries, feel free to reach out to our team.
      </p>
      <p style="margin:16px 0 0;font-size:14px;color:#374151;">
        Warm regards,<br/>
        <strong style="color:#1e40af;">Team Nextgen Solutions</strong><br/>
        <span style="font-size:12px;color:#9ca3af;">EPR Consultancy Services</span>
      </p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:24px 36px 20px;">
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:20px;" />
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:11px;color:#9ca3af;">Nextgen Solutions | EPR Consultancy</div>
            <div style="font-size:10px;color:#d1d5db;margin-top:2px;">This is an automated reminder generated by Nextgen ERP</div>
          </td>
          <td align="right">
            <div style="display:inline-block;background:#eff6ff;border-radius:6px;padding:4px 10px;">
              <span style="font-size:10px;font-weight:700;color:#2563eb;">FY {{financialYear}}</span>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>

<!--
VARIABLES: {{clientName}} {{financialYear}} {{pendingAmount}} {{totalAmount}} {{totalPaid}} {{breakdownRows}}
breakdownRows = <tr> rows for each charge line (govt, consultancy, etc.)
-->
`;

export const ANNUAL_RETURN_CONFIRMATION = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>EPR Annual Return Filed — {{clientName}}</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">

  <!-- HEADER TOP ACCENT -->
  <tr>
    <td style="background:linear-gradient(90deg,#34d399,#6ee7b7);height:4px;padding:0;"></td>
  </tr>

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#065f46 0%,#059669 60%,#10b981 100%);padding:28px 36px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1;">Nextgen Solutions</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px;">EPR Consultancy Services</div>
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <table cellpadding="0" cellspacing="0" style="display:inline-table;">
              <tr>
                <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 18px;text-align:center;">
                  <div style="font-size:22px;line-height:1;">&#10003;</div>
                  <div style="font-size:11px;color:rgba(255,255,255,0.9);font-weight:700;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Return Filed</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- HEADER BOTTOM ACCENT -->
  <tr>
    <td style="background:linear-gradient(90deg,#34d399,#6ee7b7);height:4px;padding:0;"></td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:32px 36px 0;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">Dear <strong style="color:#0f172a;">{{clientName}}</strong>,</p>
      <p style="margin:12px 0 0;font-size:14px;color:#6b7280;line-height:1.7;">
        We are pleased to inform you that your <strong style="color:#065f46;">EPR Annual Return</strong> for
        <strong style="color:#065f46;">FY {{financialYear}}</strong> has been successfully filed and verified on the CPCB portal.
      </p>
    </td>
  </tr>

  <!-- SUCCESS CARD -->
  <tr>
    <td style="padding:20px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:12px;">
        <tr>
          <td style="padding:16px 20px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:14px;">
                  <div style="width:36px;height:36px;background:#059669;border-radius:50%;text-align:center;line-height:36px;font-size:20px;color:#ffffff;font-weight:900;">&#10003;</div>
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:16px;font-weight:800;color:#065f46;">Return Successfully Filed</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:2px;">Status: <strong style="color:#059669;">Verified</strong></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FILING DETAILS TABLE -->
  <tr>
    <td style="padding:24px 36px 0;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.9px;color:#9ca3af;margin-bottom:10px;">Filing Details</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:600;color:#9ca3af;border-bottom:1px solid #f3f4f6;background:#f9fafb;width:42%;">Client</td>
          <td style="padding:11px 16px;font-size:13px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;background:#f9fafb;">{{clientName}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:600;color:#9ca3af;border-bottom:1px solid #f3f4f6;">Financial Year</td>
          <td style="padding:11px 16px;font-size:13px;font-weight:700;color:#1e40af;border-bottom:1px solid #f3f4f6;">FY {{financialYear}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:600;color:#9ca3af;border-bottom:1px solid #f3f4f6;background:#f9fafb;">Filing Date</td>
          <td style="padding:11px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;background:#f9fafb;">{{filingDate}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:600;color:#9ca3af;border-bottom:1px solid #f3f4f6;">Acknowledgement No.</td>
          <td style="padding:11px 16px;font-size:13px;font-family:monospace;color:#065f46;font-weight:700;border-bottom:1px solid #f3f4f6;">{{acknowledgeNumber}}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:600;color:#9ca3af;background:#f9fafb;">Status</td>
          <td style="padding:11px 16px;background:#f9fafb;">
            <table cellpadding="0" cellspacing="0" style="display:inline-table;">
              <tr>
                <td style="background:#d1fae5;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;color:#065f46;white-space:nowrap;">&#10003; Verified</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ATTACHMENTS NOTE -->
  <tr>
    <td style="padding:20px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;background:#eff6ff;">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1d4ed8;margin-bottom:4px;">&#128206; Attachments</div>
            <p style="margin:0;font-size:12px;color:#1e40af;line-height:1.6;">Please find the filing screenshots and acknowledgement documents attached to this email for your records.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- REMARKS (conditional) -->
  {{remarksBlock}}

  <!-- SIGN OFF -->
  <tr>
    <td style="padding:28px 36px 0;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
        Please retain this confirmation and the attached documents for your compliance records.
        Feel free to reach out if you have any questions.
      </p>
      <p style="margin:20px 0 0;font-size:14px;color:#374151;line-height:1.7;">
        Best regards,<br/>
        <strong style="color:#065f46;font-size:15px;">Team Nextgen Solutions</strong><br/>
        <span style="font-size:12px;color:#9ca3af;">EPR Consultancy Services</span>
      </p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:24px 36px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-top:20px;border-top:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:11px;color:#9ca3af;">Nextgen Solutions | EPR Consultancy</div>
                  <div style="font-size:10px;color:#d1d5db;margin-top:2px;">Auto-generated draft from Nextgen ERP — please attach screenshots before sending.</div>
                </td>
                <td style="vertical-align:middle;text-align:right;">
                  <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                    <tr>
                      <td style="background:#d1fae5;border-radius:6px;padding:4px 10px;font-size:10px;font-weight:700;color:#065f46;white-space:nowrap;">FY {{financialYear}}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>
`;

export const QUOTATION = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Quotation — {{quoteNumber}}</title>
<style>
  /* ═══════════════════════════════════════════
     NEXTGEN SOLUTIONS — QUOTATION TEMPLATE
     Fully table-based layout for email + print.
     All {{placeholders}} are replaced at runtime.
  ═══════════════════════════════════════════ */
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:13px; color:#1e293b; background:#f1f5f9; }
  .cat-badge { display:inline-block; background:#eff6ff; color:#2563eb; font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px; }
  .type-tag  { color:#64748b; font-size:11px; }
  .amount-cell { font-weight:600; color:#0f172a; }
  .fy-badge { display:inline-block; background:#dbeafe; color:#1d4ed8; font-weight:700; font-size:13px; padding:4px 12px; border-radius:20px; }
  .notes-box { background:#fffbeb; border-left:4px solid #f59e0b; border-radius:0 8px 8px 0; padding:14px 16px; margin-bottom:24px; }
  .notes-box .notes-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#b45309; margin-bottom:6px; }
  .notes-box p { color:#78350f; font-size:12px; line-height:1.6; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; background:#fff; } }
</style>
</head>
<body>

<!-- OUTER WRAPPER -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding:0;">
<tr><td align="center" style="padding:0;">
<table width="780" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:0; overflow:hidden; box-shadow:0 4px 32px rgba(0,0,0,0.10);">

  <!-- ── HEADER ── -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 45%,#2563eb 100%); padding:0;">
      <!-- Accent stripe top -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:linear-gradient(90deg,#3b82f6,#60a5fa,#93c5fd); height:3px;"></td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 36px 24px; vertical-align:top;">
            <div style="font-size:26px; font-weight:900; color:#ffffff; letter-spacing:-0.5px; line-height:1;">NEXTGEN SOLUTIONS</div>
            <div style="font-size:12px; color:rgba(255,255,255,0.65); margin-top:5px; font-weight:400; letter-spacing:0.3px;">EPR Consultancy Services</div>
          </td>
          <td style="padding:28px 36px 24px; vertical-align:top; text-align:right; white-space:nowrap;">
            <div style="font-size:30px; font-weight:900; color:#ffffff; letter-spacing:3px; line-height:1;">QUOTATION</div>
            <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:6px; font-family:monospace;">#{{quoteNumber}}</div>
            <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:2px;">{{generatedDate}}</div>
          </td>
        </tr>
      </table>
      <!-- Accent stripe bottom -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:linear-gradient(90deg,#f59e0b,#fbbf24,#fcd34d); height:3px;"></td></tr>
      </table>
    </td>
  </tr>

  <!-- ── META ROW ── -->
  <tr>
    <td style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:20px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top; width:40%;">
            <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.9px; color:#94a3b8; margin-bottom:5px;">Prepared For</div>
            <div style="font-size:16px; font-weight:800; color:#0f172a;">{{clientName}}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Client</div>
          </td>
          <td style="vertical-align:top; width:25%; text-align:center;">
            <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.9px; color:#94a3b8; margin-bottom:5px;">Financial Year</div>
            <span class="fy-badge">FY {{financialYear}}</span>
          </td>
          <td style="vertical-align:top; width:35%; text-align:right;">
            <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.9px; color:#94a3b8; margin-bottom:5px;">Quote Date</div>
            <div style="font-size:16px; font-weight:800; color:#0f172a;">{{generatedDate}}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Valid for 30 days</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── BODY ── -->
  <tr>
    <td style="padding:28px 36px;">

      <!-- SECTION HEADING -->
      <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#94a3b8; margin-bottom:12px;">EPR Credit Line Items</div>

      <!-- ITEMS TABLE -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:24px;">
        <thead>
          <tr style="background:#1e40af;">
            <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">Description</th>
            <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">Category</th>
            <th style="padding:10px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">Type</th>
            <th style="padding:10px 12px; text-align:right; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">Qty</th>
            <th style="padding:10px 12px; text-align:right; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">Rate (₹)</th>
            <th style="padding:10px 12px; text-align:right; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">GST</th>
            <th style="padding:10px 12px; text-align:right; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#fff;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {{itemRows}}
        </tbody>
      </table>

      <!-- SUMMARY (right-aligned) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="45%"></td>
          <td width="55%">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
              <tr>
                <td style="padding:8px 14px; font-size:12px; color:#64748b; background:#f8fafc;">EPR Credits Subtotal</td>
                <td style="padding:8px 14px; font-size:12px; font-weight:600; color:#0f172a; text-align:right; background:#f8fafc; white-space:nowrap;">₹{{itemsSubtotal}}</td>
              </tr>
              <tr>
                <td style="padding:8px 14px; font-size:12px; color:#64748b; border-top:1px solid #f1f5f9;">GST on Credits</td>
                <td style="padding:8px 14px; font-size:12px; font-weight:600; color:#0f172a; text-align:right; border-top:1px solid #f1f5f9; white-space:nowrap;">₹{{itemsGst}}</td>
              </tr>
              {{consultationRow}}
              {{consultationGstRow}}
              {{governmentFeesRow}}
              <tr>
                <td colspan="2" style="padding:0; border-top:1px solid #e2e8f0;"></td>
              </tr>
              <tr style="background:#1e40af;">
                <td style="padding:13px 14px; font-size:14px; font-weight:800; color:rgba(255,255,255,0.9);">Grand Total</td>
                <td style="padding:13px 14px; font-size:16px; font-weight:900; color:#ffffff; text-align:right; white-space:nowrap;">₹{{grandTotal}}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- NOTES -->
      {{notesBlock}}

    </td>
  </tr>

  <!-- ── FOOTER ── -->
  <tr>
    <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:16px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-size:13px; font-weight:700; color:#1e40af;">Nextgen Solutions</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">EPR Consultancy · Helping businesses stay compliant</div>
          </td>
          <td style="vertical-align:middle; text-align:right;">
            <div style="font-size:12px; color:#64748b;">Thank you for your business.</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Please reach out with any questions.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>

<!--
═══════════════════════════════════════════════════
AVAILABLE TEMPLATE VARIABLES:
  {{quoteNumber}}        — e.g. QT-1714123456789
  {{clientName}}         — Client company name
  {{financialYear}}      — e.g. 2025-26
  {{generatedDate}}      — e.g. 12 Apr 2025
  {{itemRows}}           — <tr> rows injected at runtime
  {{itemsSubtotal}}      — formatted number
  {{itemsGst}}           — formatted number
  {{consultationRow}}    — <tr> or empty string
  {{consultationGstRow}} — <tr> or empty string
  {{governmentFeesRow}}  — <tr> or empty string
  {{grandTotal}}         — formatted number
  {{notesBlock}}         — notes div or empty string
═══════════════════════════════════════════════════
-->
`;

