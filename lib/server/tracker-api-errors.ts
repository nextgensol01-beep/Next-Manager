import { NextResponse } from "next/server";

class TrackerRequestError extends Error {}

export async function readTrackerRequestBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new TrackerRequestError("Send a valid JSON request body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new TrackerRequestError("Send a JSON object as the request body.");
  return body as Record<string, unknown>;
}

/** Ensure unexpected tracker failures still return a JSON error to the browser. */
export function withTrackerApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof TrackerRequestError)
        return NextResponse.json({ error: error.message }, { status: 400 });
      const name = error instanceof Error ? error.name : "";
      if (name === "CastError")
        return NextResponse.json({ error: "Invalid tracker or entry identifier." }, { status: 400 });
      if (name === "ValidationError")
        return NextResponse.json({ error: "Some tracker values are invalid. Check your configuration and try again." }, { status: 400 });
      console.error("Client tracker request failed:", error);
      return NextResponse.json(
        { error: "Unable to complete the tracker request. Please try again." },
        { status: 500 },
      );
    }
  };
}
