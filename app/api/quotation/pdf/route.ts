import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const pdfSchema = z.object({
  html: z.string().min(1),
});

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));

  return candidates.find(existsSync);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = pdfSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Quotation HTML is required" }, { status: 400 });
  }

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    return NextResponse.json({
      error: "Chrome or Edge is required to generate the quotation PDF",
    }, { status: 503 });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "quotation-pdf-"));
  const htmlPath = path.join(workDir, "quotation.html");
  const pdfPath = path.join(workDir, "quotation.pdf");
  const profilePath = path.join(workDir, "browser-profile");

  try {
    await writeFile(htmlPath, parsedBody.data.html, "utf8");
    await execFileAsync(executablePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--user-data-dir=${profilePath}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 30000 });

    const pdf = await readFile(pdfPath);
    return NextResponse.json({ contentBase64: pdf.toString("base64") });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate quotation PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
