import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";

const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new Error(data.error_description || "Unable to read Gmail settings.");
  return data.access_token;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(await isAdminSession(session)))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, ...noStore },
    );

  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  const gmailUser = process.env.GMAIL_USER;
  if (!clientId || !clientSecret || !refreshToken || !gmailUser)
    return NextResponse.json({ signature: "", available: false }, noStore);

  try {
    const accessToken = await getAccessToken(
      clientId,
      clientSecret,
      refreshToken,
    );
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(gmailUser)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    const data = (await response.json()) as {
      signature?: string;
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(data.error?.message || "Unable to read Gmail signature.");
    return NextResponse.json(
      {
        signature:
          typeof data.signature === "string" ? data.signature.trim() : "",
        available: true,
      },
      noStore,
    );
  } catch (error) {
    return NextResponse.json(
      {
        signature: "",
        available: false,
        error: error instanceof Error ? error.message : "Unable to read Gmail signature.",
      },
      { status: 200, ...noStore },
    );
  }
}
