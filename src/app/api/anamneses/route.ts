import { NextResponse } from "next/server";

import { anamnesisFormSchema, anamnesisListQuerySchema } from "@/lib/anamneses";
import { anamneses } from "@/server/dal";
import {
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Anamneses (intake questionnaires) listing + create for the coach. Read via
 * TanStack Query with server-side search / pagination. Tenant-scoped through the
 * DAL (this clinic's own only); coach-only. Query + body validated with zod.
 */
export const GET = withCoach("anamneses.list", async (request, ctx) => {
  const p = new URL(request.url).searchParams;
  const parsed = anamnesisListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await anamneses.listAnamneses(ctx, {
    search: q.search,
    page: q.page,
    pageSize: q.pageSize,
  });
  return NextResponse.json(result);
});

/**
 * Creates a clinic-owned anamnese with its whole questionnaire. The DAL stamps
 * `clinicId`/`coachId` from the session. Coach-only.
 */
export const POST = withCoach("anamneses.create", async (request, ctx) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = anamnesisFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await anamneses.createAnamnesis(ctx, parsed.data);
  logger.info("anamnesis.created", { anamnesisId: result.id });
  return NextResponse.json({ anamnesis: { id: result.id } }, { status: 201 });
});
