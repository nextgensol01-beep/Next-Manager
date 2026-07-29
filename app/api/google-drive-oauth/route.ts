import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";

const REDIRECT_URI = "https://developers.google.com/oauthplayground";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: "Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET (or the Drive-specific equivalents) first.",
    }, { status: 503 });
  }
  const oauth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const code = new URL(req.url).searchParams.get("code");
  if (code) {
    try {
      const { tokens } = await oauth.getToken(code);
      return NextResponse.json({
        success: true,
        refresh_token: tokens.refresh_token,
        instructions: "Store refresh_token as GOOGLE_DRIVE_REFRESH_TOKEN, then restart the application.",
      });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Token exchange failed.",
      }, { status: 400 });
    }
  }
  return NextResponse.json({
    authUrl: oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    }),
    instructions: "Open authUrl, approve Drive access, then call this endpoint with ?code=THE_RETURNED_CODE.",
  });
}
