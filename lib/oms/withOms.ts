/**
 * Wraps an OMS API handler so that:
 *  • The OMS schema is bootstrapped on first call (idempotent migration).
 *  • Any thrown error is converted to a JSON 500 response (never an empty body).
 *
 * Without this, a missing-table error from PG produces an empty 500
 * which breaks `res.json()` on the client with "Unexpected end of JSON input".
 */
import { NextResponse } from "next/server";
import { ensureOmsSchema } from "./bootstrap";

export function withOms<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      await ensureOmsSchema();
      return await handler(...args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[oms] handler error:", msg);
      return NextResponse.json(
        { error: "oms_failure", message: msg },
        { status: 500 }
      );
    }
  };
}
