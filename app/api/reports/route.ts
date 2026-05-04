import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Deprecated: all reports now served from /api/reports/export
// This file kept to avoid 404 on any stale references
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const newUrl = `/api/reports/export${url.search}`;
  return NextResponse.redirect(new URL(newUrl, req.url));
}
