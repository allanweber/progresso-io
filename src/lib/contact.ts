/**
 * Contact-form field limits, in one place because they are enforced in two.
 *
 * The form copies them onto `maxLength`, which stops the typing before it
 * starts and is the only one a visitor ever experiences. The server action
 * re-checks the same numbers with zod, because `maxLength` lives in the
 * visitor's own browser and means nothing to anything POSTing directly at the
 * action — which is exactly what a spam run does.
 *
 * They live here rather than beside the schema because a `"use server"` module
 * may only export async functions, so the action cannot be the shared home for
 * a constant the client also needs.
 *
 * The message cap is deliberately short. This form opens a conversation — it is
 * not where anyone should be pasting a life story — and a tight bound is also
 * what keeps a spam payload from arriving as a wall of links.
 */
export const CONTACT_LIMITS = { name: 80, email: 80, message: 200 } as const;
