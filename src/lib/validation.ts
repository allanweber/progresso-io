import { z } from "zod";

/**
 * Validation helpers. Per the project rule (see AGENTS.md), every server action
 * and route handler validates its external input with zod before use — this is
 * the shared plumbing for doing so against `FormData`.
 */

export { z };

/** Field name → first validation message (forms show one message per field). */
export type FieldErrors = Record<string, string>;

/** Collapses a zod error into one message per field (keyed by the first path). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; fieldErrors: FieldErrors };

/**
 * Parses and validates `FormData` against a schema. Returns the typed data on
 * success, or per-field messages on failure.
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) {
    return { success: false, fieldErrors: fieldErrors(result.error) };
  }
  return { success: true, data: result.data };
}
