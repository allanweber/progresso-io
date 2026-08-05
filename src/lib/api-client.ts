import type { FieldErrors } from "@/lib/validation";

/**
 * Thin, domain-agnostic client-side fetch wrapper for the JSON API. Every page
 * talks to the backend through this (via TanStack Query) — see the frontend
 * rules in AGENTS.md. Non-2xx responses throw an {@link ApiError} carrying the
 * PT-BR message and any per-field messages, so forms can surface both.
 *
 * Feature response types (e.g. StudentDto) live with their domain, not here.
 */

export class ApiError extends Error {
  status: number;
  fieldErrors?: FieldErrors;

  constructor(message: string, status: number, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(
      data?.error ?? "Não foi possível concluir. Tente novamente.",
      res.status,
      data?.fieldErrors,
    );
  }
  return data as T;
}
