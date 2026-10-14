import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import {
  securityAudit,
  securityContext,
  securityDatabase,
  type SecurityContext,
} from "./email-delivery-approval";
import { DeliverySecurityError } from "./email-delivery-crypto";

export function withDeliverySecurity<Args extends unknown[]>(
  handler: (
    request: NextRequest,
    context: SecurityContext,
    ...args: Args
  ) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: Args) => {
    let context: SecurityContext | undefined;
    try {
      const session = await getServerSession(authOptions);
      if (!session)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!(await isAdminSession(session)))
        return NextResponse.json(
          {
            error: "Administrator access required for email delivery security.",
          },
          { status: 403 },
        );
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (
          request.headers.get("sec-fetch-site") === "cross-site" ||
          (origin &&
            new URL(origin).host !==
              (request.headers.get("host") || new URL(request.url).host))
        )
          throw new DeliverySecurityError(
            "Cross-site security requests are not permitted.",
            403,
          );
      }
      context = securityContext(session, request.headers);
      await securityDatabase();
      return await handler(request, context, ...args);
    } catch (error) {
      if (context) {
        // Record only a stable result code, never exception text or supplied codes.
        try {
          await securityAudit(context, "security_operation_rejected", {
            result:
              error instanceof DeliverySecurityError
                ? error.code
                : error instanceof z.ZodError
                  ? "INVALID_REQUEST"
                  : "OPERATION_FAILED",
          });
        } catch {
          /* Database failure must still deny the operation. */
        }
      }
      if (error instanceof DeliverySecurityError)
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            ...(error.attemptsRemaining !== undefined
              ? { attemptsRemaining: error.attemptsRemaining }
              : {}),
          },
          { status: error.status },
        );
      if (error instanceof z.ZodError)
        return NextResponse.json(
          { error: "Invalid security request. Check the supplied fields." },
          { status: 400 },
        );
      if (
        error instanceof SyntaxError ||
        (error as { name?: string })?.name === "CastError"
      )
        return NextResponse.json(
          { error: "Invalid request or identifier." },
          { status: 400 },
        );
      // Do not log the exception object: mail/validation errors can contain sensitive input.
      console.error("Email delivery security operation failed.");
      return NextResponse.json(
        { error: "Unable to complete this security operation. Try again." },
        { status: 500 },
      );
    }
  };
}
export async function securityRequestBody(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 10_000_000)
    throw new DeliverySecurityError("This delivery request is too large.", 413);
  const text = await request.text();
  if (text.length > 10_000_000)
    throw new DeliverySecurityError("This delivery request is too large.", 413);
  return JSON.parse(text);
}
export const verificationFields = {
  approvalId: z.string().uuid(),
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  pin: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
};
