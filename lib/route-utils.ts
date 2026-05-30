import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      session: null,
      actor: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const user = session.user as typeof session.user & { id?: string };
  return {
    session,
    actor: {
      id: user?.id || "",
      name: user?.name || "",
      email: user?.email || "",
    },
    response: null,
  };
}

export function errorResponse(error: unknown, fallback = "Internal server error", status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status });
}
