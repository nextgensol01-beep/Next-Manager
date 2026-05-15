import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import BulkReminderJob from "@/models/BulkReminderJob";
import EmailLog from "@/models/EmailLog";
import { sendEmail } from "@/utils/email";
import { PAYMENT_REMINDER } from "@/lib/templates";

type BulkReminderJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
type BulkReminderJobStatusSnapshot = { status: BulkReminderJobStatus };

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReminderHtml(clientName: string, financialYear: string, pendingAmount: number, totalAmount: number, totalPaid: number) {
  return PAYMENT_REMINDER
    .replace(/{{clientName}}/g, clientName)
    .replace(/{{financialYear}}/g, financialYear)
    .replace(/{{pendingAmount}}/g, fmt(pendingAmount))
    .replace(/{{totalAmount}}/g, fmt(totalAmount))
    .replace(/{{totalPaid}}/g, fmt(totalPaid))
    .replace(/{{breakdownRows}}/g, "");
}

// POST /api/email/bulk-reminder — create a new job
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();
    const { fy, recipients, delayMs = 6000 } = body;

    if (!fy || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "fy and recipients[] required" }, { status: 400 });
    }
    if (delayMs < 3000 || delayMs > 60000) {
      return NextResponse.json({ error: "delayMs must be 3000–60000" }, { status: 400 });
    }

    // Block if a job for this FY is already running
    const running = await BulkReminderJob.findOne({ fy, status: "running" });
    if (running) {
      return NextResponse.json({ error: "A bulk job is already running for this FY", jobId: running._id }, { status: 409 });
    }

    const job = await BulkReminderJob.create({
      fy,
      recipients: recipients.map((r: Record<string, unknown>) => ({ ...r, status: "pending" })),
      delayMs,
      totalCount: recipients.length,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      status: "pending",
    });

    return NextResponse.json({ jobId: job._id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/email/bulk-reminder:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/email/bulk-reminder?jobId=xxx — poll job status
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  try {
    await connectDB();

    if (jobId) {
      const job = await BulkReminderJob.findById(jobId).lean();
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      return NextResponse.json(job);
    }

    // List recent jobs
    const jobs = await BulkReminderJob.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select("fy status createdAt startedAt completedAt totalCount sentCount failedCount skippedCount delayMs")
      .lean();
    return NextResponse.json(jobs);
  } catch (err) {
    console.error("GET /api/email/bulk-reminder:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/email/bulk-reminder — start or cancel a job
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { jobId, action } = await req.json();
    if (!jobId || !action) return NextResponse.json({ error: "jobId and action required" }, { status: 400 });

    const job = await BulkReminderJob.findById(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (action === "cancel") {
      if (!["pending", "running"].includes(job.status)) {
        return NextResponse.json({ error: "Cannot cancel a completed job" }, { status: 400 });
      }
      job.status = "cancelled";
      job.completedAt = new Date();
      await job.save();
      return NextResponse.json({ ok: true });
    }

    if (action === "start") {
      if (job.status !== "pending") {
        return NextResponse.json({ error: "Job is not in pending state" }, { status: 400 });
      }

      // Mark as running immediately so the client can start polling
      job.status = "running";
      job.startedAt = new Date();
      await job.save();

      // Fire and forget — process in background
      // We use setImmediate so the HTTP response returns before we start sending
      setImmediate(() => processBulkJob(jobId.toString()));

      return NextResponse.json({ ok: true, status: "running" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/email/bulk-reminder:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Background processor — runs after response is returned
async function processBulkJob(jobId: string) {
  try {
    await connectDB();
    const job = await BulkReminderJob.findById(jobId);
    if (!job || job.status !== "running") return;

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    // Gmail rate-limit signals
    const RATE_LIMIT_ERRORS = [
      "too many", "rate limit", "quota", "daily limit", "limit exceeded",
      "service unavailable", "temporarily unavailable", "550", "421",
    ];

    for (let i = 0; i < job.recipients.length; i++) {
      // Re-fetch to check for cancellation
      const fresh = await BulkReminderJob.findById(jobId)
        .select("status")
        .lean<BulkReminderJobStatusSnapshot | null>();
      if (!fresh || fresh.status === "cancelled") break;

      const recipient = job.recipients[i];
      if (recipient.status !== "pending") continue;

      try {
        const html = buildReminderHtml(
          recipient.clientName,
          recipient.financialYear,
          recipient.pendingAmount,
          recipient.totalAmount,
          recipient.totalPaid,
        );

        const result = await sendEmail({
          to: recipient.email,
          subject: `Payment Reminder — ${recipient.clientName} — FY ${recipient.financialYear}`,
          html,
        });

        if (result.success) {
          job.recipients[i].status = "sent";
          job.recipients[i].sentAt = new Date();
          job.sentCount += 1;

          // Log to EmailLog
          await EmailLog.create({
            type: "payment_reminder",
            to: [recipient.email],
            subject: `Payment Reminder — ${recipient.clientName} — FY ${recipient.financialYear}`,
            clientId: recipient.clientId,
            clientName: recipient.clientName,
            financialYear: recipient.financialYear,
            status: "sent",
            notes: `Bulk job ${jobId}`,
          });
        } else {
          job.recipients[i].status = "failed";
          job.recipients[i].error = result.message;
          job.failedCount += 1;

          // Detect Gmail rate limiting and abort the whole job
          const errLower = result.message.toLowerCase();
          const isRateLimit = RATE_LIMIT_ERRORS.some((sig) => errLower.includes(sig));
          if (isRateLimit) {
            // Mark remaining as skipped
            for (let j = i + 1; j < job.recipients.length; j++) {
              if (job.recipients[j].status === "pending") {
                job.recipients[j].status = "skipped";
                job.recipients[j].error = "Job aborted: Gmail rate limit detected";
                job.skippedCount += 1;
              }
            }
            job.status = "failed";
            job.completedAt = new Date();
            job.markModified("recipients");
            await job.save();
            return;
          }
        }
      } catch (err) {
        job.recipients[i].status = "failed";
        job.recipients[i].error = err instanceof Error ? err.message : "Unknown error";
        job.failedCount += 1;
      }

      job.markModified("recipients");
      await job.save();

      // Throttled delay between sends — except after the last one
      if (i < job.recipients.length - 1) {
        await delay(job.delayMs);
      }
    }

    // Final status
    const fresh2 = await BulkReminderJob.findById(jobId)
      .select("status")
      .lean<BulkReminderJobStatusSnapshot | null>();
    if (fresh2 && fresh2.status === "running") {
      job.status = job.failedCount > 0 && job.sentCount === 0 ? "failed" : "completed";
      job.completedAt = new Date();
      await job.save();
    }
  } catch (err) {
    console.error("processBulkJob error:", err);
    try {
      await BulkReminderJob.findByIdAndUpdate(jobId, {
        status: "failed",
        completedAt: new Date(),
      });
    } catch { /* ignore */ }
  }
}
