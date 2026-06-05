import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templatePath = path.join(process.cwd(), "templates", "quotation.html");
  const html = await readFile(templatePath, "utf8");
  return NextResponse.json({ html });
}
