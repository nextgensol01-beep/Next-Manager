import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import EmailLog from "@/models/EmailLog";
import ClientWorkItem from "@/models/ClientWorkItem";
import { recordActivityEvent } from "@/lib/server/activity-events";

async function gmailToken() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID,
    clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET,
    refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error("Gmail is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new Error(data.error_description || "Unable to access Gmail.");
  return data.access_token;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(session)))
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  await connectDB();
  const { id } = await params;
  const logs = (await EmailLog.find({
    trackerId: id,
    status: "sent",
    gmailThreadId: { $exists: true, $ne: "" },
    communicationStatus: { $ne: "replied" },
  })
    .limit(100)
    .lean()) as unknown as Array<{
    _id: unknown;
    gmailThreadId: string;
    sentAt: Date;
    clientId: string;
    subject?: string;
    financialYear?: string;
  }>;
  if (!logs.length) return NextResponse.json({ checked: 0, replied: 0 });
  try {
    const token = await gmailToken();
    const ownEmail = (process.env.GMAIL_USER || "").toLowerCase();
    let replied = 0;
    for (const log of logs) {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(log.gmailThreadId)}?format=metadata&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const thread = (await response.json()) as {
        messages?: Array<{
          id?: string;
          internalDate?: string;
          payload?: { headers?: Array<{ name?: string; value?: string }> };
        }>;
      };
      if (!response.ok) continue;
      const reply = thread.messages?.find((message) => {
        const from =
          message.payload?.headers
            ?.find((header) => header.name?.toLowerCase() === "from")
            ?.value?.toLowerCase() || "";
        return (
          from &&
          !from.includes(ownEmail) &&
          Number(message.internalDate || 0) > new Date(log.sentAt).getTime()
        );
      });
      if (reply?.id) {
        replied += 1;
        const repliedAt = new Date(Number(reply.internalDate));
        await Promise.all([
          EmailLog.updateOne(
            { _id: log._id },
            {
              $set: {
                communicationStatus: "replied",
                repliedAt,
                gmailReplyMessageId: reply.id,
              },
            },
          ),
          ClientWorkItem.updateMany(
            { emailLogId: String(log._id), kind: "follow_up", status: "open" },
            { $set: { status: "completed", completedAt: repliedAt } },
          ),
          recordActivityEvent(
            {
              clientId: log.clientId,
              category: "communications",
              type: "tracker_email_replied",
              label: "Client replied to tracker email",
              detail: log.subject || "A client replied to a tracker email.",
              color: "violet",
              badge: "Replied",
              financialYear: log.financialYear,
              entityId: id,
              entityType: "client_tracker",
              relatedEntityIds: [String(log._id)],
              occurredAt: repliedAt,
            },
            session,
          ),
        ]);
      }
    }
    return NextResponse.json({ checked: logs.length, replied });
  } catch (error) {
    return NextResponse.json(
      {
        error: `${error instanceof Error ? error.message : "Unable to check replies."} Reconnect Gmail with Gmail read permission to enable reply tracking.`,
      },
      { status: 409 },
    );
  }
}
