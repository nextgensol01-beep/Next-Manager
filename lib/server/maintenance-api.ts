import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { AccountSecurityError, requireSameOrigin } from "@/lib/server/account-security";

export function withAdminMaintenance(operation: () => Promise<Response>) {
  return async (request: Request) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      requireSameOrigin(request);
      if (!(await isAdminSession(session))) {
        return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
      }
      return await operation();
    } catch (error) {
      if (error instanceof AccountSecurityError && error.status === 403) {
        return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
      }
      console.error("Maintenance operation failed:", error);
      return NextResponse.json({ error: "Maintenance operation failed" }, { status: 500 });
    }
  };
}
