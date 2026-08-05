import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger, withRoute } from "@/server/observability";

/**
 * Health probe. `GET /api/health` is a cheap liveness check (the process is up
 * and serving). `GET /api/health?deep=1` additionally pings the database, for
 * readiness checks / uptime monitors — it returns 503 when the DB is
 * unreachable so an orchestrator (Dokploy) can act on it.
 */
export const GET = withRoute("health", async (request) => {
  const deep = new URL(request.url).searchParams.get("deep");
  if (!deep) return NextResponse.json({ status: "ok" });

  const start = performance.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      status: "ok",
      db: { ok: true, latencyMs: Math.round(performance.now() - start) },
    });
  } catch (error) {
    logger.error("health.db_unreachable", {
      err: error,
      latencyMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { status: "degraded", db: { ok: false } },
      { status: 503 },
    );
  }
}, { quiet: true });
