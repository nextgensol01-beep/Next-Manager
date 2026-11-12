import nodemailer from "nodemailer8";
import { z } from "zod";

const controlCharacters = /[\x00-\x1f\x7f]/;
const mailboxSchema = z.email();
const isMailbox = (value: string) => !controlCharacters.test(value) && mailboxSchema.safeParse(value.trim()).success;
const mailbox = z.string().refine(isMailbox);
export const smtpRecipientSchema = z.union([
  z.string().refine(value => value.split(",").every(isMailbox)),
  z.array(mailbox).min(1),
]);
export const smtpSubjectSchema = z.string().refine(value => !!value.trim() && !controlCharacters.test(value));

const smtpPayloadSchema = z.strictObject({
  to: smtpRecipientSchema,
  subject: smtpSubjectSchema,
  html: z.string(),
  // Internal callers may supply bytes or literal text, never a path, URL or stream.
  attachments: z.array(z.strictObject({
    filename: z.string().refine(value => !!value.trim() && value !== "." && value !== ".." &&
      !controlCharacters.test(value) && !/[\\/:]/.test(value)),
    content: z.union([z.instanceof(Buffer), z.string()]),
    contentType: z.string().regex(/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/).optional(),
  })).optional(),
});

type EmailPayload = z.infer<typeof smtpPayloadSchema>;

// Replace {{placeholders}} in templates
export function processTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replaceAll(`{{${key}}}`, value);
  });
  return result;
}

export const EMAIL_TEMPLATES = {
  paymentReminder: {
    subject: "Payment Reminder - {{clientName}} | FY {{financialYear}}",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1E40AF; color: white; padding: 30px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Nextgen Solutions</h1>
          <p style="margin: 5px 0 0; opacity: 0.8;">EPR Consultancy</p>
        </div>
        <div style="padding: 30px 20px; background: white;">
          <h2 style="color: #1E40AF;">Payment Reminder</h2>
          <p>Dear <strong>{{clientName}}</strong>,</p>
          <p>This is a reminder that you have a pending payment for the financial year <strong>{{financialYear}}</strong>.</p>
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6B7280;">Total Billed:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold;">₹{{totalBilled}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6B7280;">Amount Paid:</td>
                <td style="padding: 8px 0; text-align: right; color: #16A34A; font-weight: bold;">₹{{totalPaid}}</td>
              </tr>
              <tr style="border-top: 2px solid #E5E7EB;">
                <td style="padding: 8px 0; font-weight: bold;">Pending Amount:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #DC2626; font-size: 18px;">₹{{pendingAmount}}</td>
              </tr>
            </table>
          </div>
          <p>Please clear the pending amount at your earliest convenience. If you have any questions, please contact us.</p>
          <p>Thank you for your continued business.</p>
          <p style="color: #6B7280; font-size: 12px; margin-top: 30px;">
            This is an automated reminder from Nextgen Solutions ERP System.
          </p>
        </div>
        <div style="background: #F9FAFB; padding: 15px; text-align: center; color: #6B7280; font-size: 12px;">
          Nextgen Solutions | EPR Consultancy | {{companyEmail}}
        </div>
      </div>
    `,
  },
  quotation: {
    subject: "Quotation for EPR Services - FY {{financialYear}} | Nextgen Solutions",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1E40AF; color: white; padding: 30px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Nextgen Solutions</h1>
          <p style="margin: 5px 0 0; opacity: 0.8;">EPR Consultancy</p>
        </div>
        <div style="padding: 30px 20px; background: white;">
          <h2 style="color: #1E40AF;">Quotation for EPR Compliance Services</h2>
          <p>Dear <strong>{{clientName}}</strong>,</p>
          <p>Please find attached our quotation for EPR compliance services for the financial year <strong>{{financialYear}}</strong>.</p>
          <p>We look forward to serving you. Please review the attached quotation and feel free to reach out for any clarifications.</p>
          <p>Best regards,<br/>Team Nextgen Solutions</p>
        </div>
        <div style="background: #F9FAFB; padding: 15px; text-align: center; color: #6B7280; font-size: 12px;">
          Nextgen Solutions | EPR Consultancy | {{companyEmail}}
        </div>
      </div>
    `,
  },
  custom: {
    subject: "{{subject}}",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1E40AF; color: white; padding: 30px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Nextgen Solutions</h1>
        </div>
        <div style="padding: 30px 20px; background: white;">
          {{body}}
        </div>
        <div style="background: #F9FAFB; padding: 15px; text-align: center; color: #6B7280; font-size: 12px;">
          Nextgen Solutions | EPR Consultancy
        </div>
      </div>
    `,
  },
};

function createTransporter() {
  const user     = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!user || !password) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: password },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function sendEmail(
  payload: EmailPayload
): Promise<{ success: boolean; message: string }> {
  const parsed = smtpPayloadSchema.safeParse(payload);
  if (!parsed.success) return { success: false, message: "Invalid email details" };

  try {
    const transporter = createTransporter();
    if (!transporter) return { success: false, message: "Email service is not configured" };

    const { to, subject, html, attachments } = parsed.data;
    await transporter.sendMail({
      from: `"Nextgen Solutions" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    });

    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, message: "Failed to send email" };
  }
}
