import { NextResponse } from "next/server";

import {
  TEST_OUTBOX_ENABLED,
  clearOutbox,
  readOutbox,
} from "@/lib/test-outbox";

/**
 * Test-only e-mail outbox, exposed ONLY when `ENABLE_TEST_OUTBOX=true`. Lets
 * e2e read the invite link (tokens are stored hashed, so it can't be recovered
 * from the database). The flag is never set in production, where every method
 * here 404s — the route effectively doesn't exist.
 */

export async function GET() {
  if (!TEST_OUTBOX_ENABLED) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ messages: readOutbox() });
}

export async function DELETE() {
  if (!TEST_OUTBOX_ENABLED) return new NextResponse(null, { status: 404 });
  clearOutbox();
  return NextResponse.json({ ok: true });
}
