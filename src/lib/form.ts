import type { AnyFieldApi } from "@tanstack/react-form";

/**
 * The message to show under a TanStack Form field: the first client-side
 * (touched) validation error, or a server-provided message as a fallback.
 * Shared by every feature form (student form, invite accept, …).
 */
export function fieldError(
  field: AnyFieldApi,
  serverError?: string,
): string | undefined {
  if (field.state.meta.isTouched && field.state.meta.errors.length > 0) {
    const first = field.state.meta.errors[0];
    return typeof first === "string" ? first : first?.message;
  }
  return serverError;
}
