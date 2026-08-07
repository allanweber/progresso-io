import { NextResponse } from "next/server";

import { dietFormSchema } from "@/lib/diets";
import { diets } from "@/server/dal";
import {
  apiError,
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A single diet: read its full tree, replace it, archive or unarchive it.
 * Reads see base templates + this clinic's own; every write only ever touches
 * the clinic's own diets (the DAL scopes by `clinicId`, so a base/other-clinic
 * id yields a 404). Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>("diets.detail", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Dieta não encontrada.");

  const diet = await diets.getDiet(ctx, id);
  if (!diet) return notFound("Dieta não encontrada.");
  return NextResponse.json(diet);
});

export const PUT = withRoute<Params>("diets.update", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Dieta não encontrada.");

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = dietFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await diets.updateDiet(ctx, id, parsed.data);
  if (!result.ok) {
    if (result.reason === "invalid_food") {
      return apiError("Um dos alimentos selecionados é inválido.", 422);
    }
    return notFound("Dieta não encontrada ou não editável.");
  }
  logger.info("diet.updated", { dietId: id });
  return NextResponse.json({ diet: { id } });
});

export const DELETE = withRoute<Params>("diets.archive", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Dieta não encontrada.");

  const ok = await diets.archiveDiet(ctx, id);
  if (!ok) return notFound("Dieta não encontrada ou não editável.");
  logger.info("diet.archived", { dietId: id });
  return NextResponse.json({ diet: { id } });
});

export const PATCH = withRoute<Params>("diets.unarchive", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Dieta não encontrada.");

  const ok = await diets.unarchiveDiet(ctx, id);
  if (!ok) return notFound("Dieta não encontrada ou não editável.");
  logger.info("diet.unarchived", { dietId: id });
  return NextResponse.json({ diet: { id } });
});
