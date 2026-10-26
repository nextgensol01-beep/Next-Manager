import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import { readTrackerRequestBody, withTrackerApiErrors } from "@/lib/server/tracker-api-errors";
import { previewTrackerSync, proposedTrackerAudience, type MembershipTracker } from "@/lib/server/tracker-membership";
export const runtime = "nodejs";
export const maxDuration = 60;
// Preview only. Confirmed additions and mode changes use the existing Configure PATCH.
export const POST = withTrackerApiErrors(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(session))) return NextResponse.json({ error: "Administrator access required to sync clients." }, { status: 403 });
  await connectDB();
  const { id } = await params;
  const tracker = await ClientTracker.findById(id).select("fields clientScope clientMembershipMode clientCategories clientIds status").lean<MembershipTracker | null>();
  if (!tracker) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tracker.status !== "active") return NextResponse.json({ error: "Restore this tracker before syncing clients." }, { status: 409 });
  const audience = proposedTrackerAudience(tracker, await readTrackerRequestBody(request));
  return NextResponse.json(await previewTrackerSync(audience, session.user?.email?.toLowerCase() || ""), { headers: { "Cache-Control": "private, no-store" } });
});
