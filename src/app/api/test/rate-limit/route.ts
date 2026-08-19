import { NextResponse } from "next/server";

import { TEST_OUTBOX_ENABLED } from "@/lib/test-outbox";
import { z } from "@/lib/validation";
import { __clearRateLimit } from "@/server/rate-limit";

/**
 * Test-only rate-limit reset, exposed ONLY when `ENABLE_TEST_OUTBOX=true` —
 * the same switch that gates the outbox, and the same guarantee: the flag is
 * never set in production, where this 404s and the route effectively does not
 * exist. Sharing the flag is deliberate; a second one would be a second thing
 * to get wrong.
 *
 * WHY IT EXISTS: the contact form allows one message per IP per day, and the
 * e2e suite runs every worker from one localhost IP against one server process
 * with `retries: 1`. The first attempt spends the only budget, so the retry
 * fails no matter what the form does — turning any flake into a hard failure.
 * The suite clears its own bucket instead.
 *
 * The prefix is REQUIRED, not optional-defaulting-to-everything: a bare reset
 * would disarm the sign-in and OTP limiters for whatever spec happens to be
 * running alongside.
 */

const querySchema = z.object({
  prefix: z.string().min(1).max(100),
});

export async function DELETE(request: Request) {
  if (!TEST_OUTBOX_ENABLED) return new NextResponse(null, { status: 404 });

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe o prefixo da chave a limpar." },
      { status: 400 },
    );
  }

  __clearRateLimit(parsed.data.prefix);
  return NextResponse.json({ ok: true });
}
