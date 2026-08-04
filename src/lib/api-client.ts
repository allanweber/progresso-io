import type { Modality, StudentStatus } from "@/db/schema";
import type { FieldErrors } from "@/lib/validation";

/**
 * Thin client-side fetch wrapper for the JSON API. Every page talks to the
 * backend through this (via TanStack Query) — see the frontend rules in
 * AGENTS.md. Non-2xx responses throw an {@link ApiError} carrying the PT-BR
 * message and any per-field messages, so forms can surface both.
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

/** A student as serialized by the API (timestamps are ISO strings over JSON). */
export type StudentDto = {
  id: string;
  clinicId: string;
  coachId: string | null;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  goal: string | null;
  status: StudentStatus;
  modality: Modality;
  createdAt: string;
  updatedAt: string;
};

/** A student plus the roster's derived access flags. */
export type StudentRosterDto = StudentDto & {
  hasAccount: boolean;
  pendingInvite: boolean;
};
