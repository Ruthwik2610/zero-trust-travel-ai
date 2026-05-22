import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  const configured = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  const enabled = process.env.SENTRY_SMOKE_ENABLED === "1";
  let eventId: string | undefined;

  if (configured && enabled) {
    eventId = Sentry.captureException(new Error("Travel AI Sentry smoke test"));
    await Sentry.flush(2000);
  }

  return NextResponse.json({
    configured,
    enabled,
    captured: Boolean(eventId),
    eventIdPresent: Boolean(eventId)
  });
}
