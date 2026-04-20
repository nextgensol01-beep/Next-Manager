import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  createPersonProfile,
  listPersons,
} from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const limitParam = searchParams.get("limit");
  const parsedLimit = limitParam === "all"
    ? null
    : Number.parseInt(limitParam || "20", 10);
  const safeLimit = typeof parsedLimit === "number" && Number.isFinite(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : 20;

  const persons = await listPersons({
    search,
    limit: limitParam === "all" ? null : safeLimit,
  });
  return NextResponse.json(persons);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const { person, merged } = await createPersonProfile(body);
    return NextResponse.json(
      merged ? { ...person.toObject(), merged: true } : person,
      { status: merged ? 200 : 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save person";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
