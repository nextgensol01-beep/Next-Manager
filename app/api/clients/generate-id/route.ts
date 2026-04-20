import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { getLikelyNextClientId } from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "PWP";
    await connectDB();
    const likelyClientId = await getLikelyNextClientId(category);
    return NextResponse.json({
      clientId: `Likely ID: ${likelyClientId}`,
      category,
      reserved: false,
    });
  } catch (error) {
    console.error("GET /api/clients/generate-id:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
