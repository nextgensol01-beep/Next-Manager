import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import DeletedRecord from "@/models/DeletedRecord";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const result = await DeletedRecord.deleteMany({});
    return NextResponse.json({ deleted: result.deletedCount });
  } catch (error) {
    console.error("DELETE /api/trash/empty:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
