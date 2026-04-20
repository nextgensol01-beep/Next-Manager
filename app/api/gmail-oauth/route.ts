/**
 * GET  /api/gmail-oauth          — returns auth URL to start OAuth flow
 * GET  /api/gmail-oauth?code=... — exchanges code for tokens, shows refresh token
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];
const REDIRECT_URI = "https://developers.google.com/oauthplayground";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId     = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: "GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET must be set in .env.local first.",
    }, { status: 503 });
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    // Exchange code for tokens
    try {
      const { tokens } = await oauth2Client.getToken(code);
      return NextResponse.json({
        success: true,
        message: "Copy the refresh_token below into your .env.local as GMAIL_OAUTH_REFRESH_TOKEN",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
      });
    } catch (err: unknown) {
      const error = err as { message?: string };
      return NextResponse.json({ error: "Token exchange failed: " + (error?.message || String(err)) }, { status: 400 });
    }
  }

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  return NextResponse.json({ authUrl, instructions: "Open the authUrl in a browser, approve, then copy the 'code' param from the redirect URL back to /api/gmail-oauth?code=YOUR_CODE" });
}
