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

/**
 * Hard ceiling on how long any single API call may wait for a response. Without
 * it, a request that never completes (an unresponsive server, a stalled DB
 * connection) would leave the caller's query stuck "loading" forever — the
 * invite check is the cautionary example. On timeout the request is aborted and
 * surfaced as an {@link ApiError}, so the UI shows an error/retry, never a
 * permanent spinner.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      // Respect a caller-provided signal; otherwise bound the request so it
      // cannot hang indefinitely.
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch (error) {
    // Timeout or network failure — turn it into an ApiError so callers surface
    // a message and a retry instead of hanging.
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError(
      timedOut
        ? "O servidor demorou a responder. Tente novamente."
        : "Não foi possível conectar ao servidor. Tente novamente.",
      0,
    );
  }

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
