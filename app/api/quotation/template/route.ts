import { NextResponse } from "next/server";
import { QUOTATION } from "@/lib/templates";

export async function GET() {
  return NextResponse.json({ html: QUOTATION });
}
