import { z } from "zod";

/**
 * Validation helpers. Per the project rule (see AGENTS.md), every server action
 * and route handler validates its external input with zod before use — this is
 * the shared plumbing for doing so against `FormData`.
 */

export { z };

/** First human-readable message from a zod error (forms show one at a time). */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Parses and validates `FormData` against a schema. Returns the typed data on
 * success, or the first validation message on failure.
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: firstError(result.error) };
  return { success: true, data: result.data };
}
