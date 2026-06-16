import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import puppeteer, { type Browser, type LaunchOptions } from "puppeteer-core";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

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

async function getBrowserLaunchOptions(): Promise<LaunchOptions> {
  const executablePath = findBrowserExecutable();

  if (executablePath) {
    return {
      args: [
        "--disable-gpu",
        "--no-sandbox",
      ],
      executablePath,
      headless: true,
    };
  }

  return {
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = pdfSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Quotation HTML is required" }, { status: 400 });
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch(await getBrowserLaunchOptions());
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setContent(parsedBody.data.html, { waitUntil: "load" });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => undefined);
    const pdf = await page.pdf({
      displayHeaderFooter: false,
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });

    return NextResponse.json({ contentBase64: Buffer.from(pdf).toString("base64") });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate quotation PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
