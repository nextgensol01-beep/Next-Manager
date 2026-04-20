import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  createClientRecord,
  listClientSummaries,
  listClientsWithContacts,
} from "@/lib/server/client-contact-service";

const isClientValidationError = (message: string) =>
  message.includes("required") ||
  message.includes("missing") ||
  message.includes("needs at least one") ||
  message.includes("Select at least one") ||
  message.includes("Unable to resolve contact");

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const summaryOnly = searchParams.get("summary") === "1";

  if (summaryOnly) {
    const categories = searchParams
      .get("categories")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) || [];
    const search = searchParams.get("search");
    const limitParam = searchParams.get("limit");
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;

    const clients = await listClientSummaries({
      category: searchParams.get("category"),
      categories,
      state: searchParams.get("state"),
      search,
      limit: Number.isFinite(parsedLimit)
        ? parsedLimit
        : (!search && categories.length === 0 ? 100 : 250),
    });

    return NextResponse.json(clients);
  }

  const clients = await listClientsWithContacts({
    category: searchParams.get("category"),
    state: searchParams.get("state"),
    search: searchParams.get("search"),
  });

  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();
    const client = await createClientRecord(body);
    return NextResponse.json(client, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/clients error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = isClientValidationError(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
