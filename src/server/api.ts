import { NextResponse } from "next/server";

import { fieldErrors, z } from "@/lib/validation";

/**
 * Small helpers for JSON API route handlers so responses stay consistent:
 * errors are always `{ error }` (plus `{ fieldErrors }` for validation), with
 * PT-BR messages. Every handler still validates input with zod and derives the
 * tenant from the session — these only shape the response.
 */

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** 401 for unauthenticated / tenant-less requests. */
export function unauthorized(): NextResponse {
  return apiError("Não autenticado.", 401);
}

/** 404 for a resource missing in this clinic (or a hidden test route). */
export function notFound(message = "Não encontrado."): NextResponse {
  return apiError(message, 404);
}

/** 422 with per-field messages from a failed zod parse. */
export function validationError(error: z.ZodError): NextResponse {
  return NextResponse.json(
    { error: "Verifique os campos informados.", fieldErrors: fieldErrors(error) },
    { status: 422 },
  );
}

/**
 * Reads a JSON body, returning either the parsed value or a ready-made 400 —
 * so handlers stay `const body = await readJson(request); if (!body.ok) return
 * body.response;`.
 */
export async function readJson(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return { ok: false, response: apiError("Corpo da requisição inválido.", 400) };
  }
}

const uuidSchema = z.string().uuid();

/** Whether a route param is a well-formed UUID (guards DB lookups). */
export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
