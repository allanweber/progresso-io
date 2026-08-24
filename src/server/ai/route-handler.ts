import { NextResponse } from "next/server";

import {
  AI_REFUSAL_MESSAGES,
  type AiGenerateResultDto,
  type AiRefusalCode,
} from "@/lib/ai-programs";
import type { z } from "@/lib/validation";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import type { TenantContext } from "@/server/tenant";
import type { GenerateResult } from "./generate";

/**
 * The shared body of both generate routes — they differ only in the form they
 * accept and the service function they call, so the gates, the status codes and
 * the PT-BR copy live in one place rather than being duplicated and drifting
 * apart. Each route passes its own schema: treino and dieta ask the coach
 * different questions, and neither may accept the other's.
 */

/** Refusals map to a status the client can branch on without parsing prose. */
const REFUSAL_STATUS: Record<AiRefusalCode, number> = {
  // Not the coach's fault and not fixable by retrying — the install has no
  // provider configured. 503 says "come back later", which is accurate.
  not_configured: 503,
  no_anamnesis: 409,
  quota_exceeded: 402,
  already_running: 409,
};

export async function handleGenerate<Schema extends z.ZodType>(
  request: Request,
  ctx: TenantContext,
  params: Promise<{ id: string }>,
  schema: Schema,
  generate: (
    ctx: TenantContext,
    studentId: string,
    input: z.infer<Schema>,
  ) => Promise<GenerateResult>,
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return notFound("Aluno não encontrado.");

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await generate(ctx, id, parsed.data);

  if (!result.ok && "refusal" in result) {
    if (result.refusal === "not_found") return notFound("Aluno não encontrado.");
    const code = result.refusal satisfies AiRefusalCode;
    return NextResponse.json(
      { error: AI_REFUSAL_MESSAGES[code], code },
      { status: REFUSAL_STATUS[code] },
    );
  }
  if (!result.ok) {
    // The model was called and something went wrong. The credit has already
    // been released by the service, so "tente de novo" is honest advice.
    return apiError(`${result.message} Tente de novo.`, 502);
  }

  logger.info("ai.generated", { studentId: id, repaired: result.repaired });
  return NextResponse.json({
    used: result.used,
    limit: result.limit,
    repaired: result.repaired,
  } satisfies AiGenerateResultDto);
}
