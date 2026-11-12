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
const printUrl = "https://quotation.invalid/";
const printPolicy = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
// Fail closed even for browser networking outside page request interception.
const offlineArgs = [
  "--host-resolver-rules=MAP * ~NOTFOUND",
  "--proxy-server=http://quotation.invalid:9",
  "--proxy-bypass-list=<-loopback>",
  "--dns-prefetch-disable",
];

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
        ...offlineArgs,
      ],
      executablePath,
      headless: true,
    };
  }

  return {
    args: [...chromium.args, ...offlineArgs],
    executablePath: await chromium.executablePath(),
    headless: true,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = pdfSchema.safeParse(await req.json().catch(() => undefined));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Quotation HTML is required" }, { status: 400 });
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({ ...await getBrowserLaunchOptions(), pipe: true });
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setJavaScriptEnabled(false);
    await page.setOfflineMode(true);
    await page.setRequestInterception(true);
    let served = false;
    page.on("request", async request => {
      // Serve the single navigation from memory so the policy is in place before HTML parsing.
      if (!served && request.isNavigationRequest() && request.frame() === page.mainFrame() && request.url() === printUrl) {
        served = true;
        await request.respond({
          status: 200,
          contentType: "text/html; charset=utf-8",
          headers: { "Content-Security-Policy": printPolicy, "X-DNS-Prefetch-Control": "off" },
          body: parsedBody.data.html,
        });
      } else {
        await request.abort("blockedbyclient");
      }
    });
    const response = await page.goto(printUrl, { waitUntil: "load" });
    if (!served || !response?.ok()) throw new Error("Print document did not load");
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => undefined);
    const pdf = await page.pdf({
      displayHeaderFooter: false,
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });

    return NextResponse.json({ contentBase64: Buffer.from(pdf).toString("base64") });
  } catch (error: unknown) {
    console.error("Quotation PDF generation failed:", error);
    return NextResponse.json({ error: "Failed to generate quotation PDF" }, { status: 500 });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
