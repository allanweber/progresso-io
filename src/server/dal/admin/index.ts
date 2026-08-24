/**
 * Platform-admin DAL — the one deliberate exception to the tenant-scoping rule.
 *
 * Every other DAL module takes a {@link import("@/server/tenant").TenantContext}
 * and scopes each query by `clinicId`. A platform admin (`role = "admin"`) works
 * ACROSS clinics and belongs to none, so these functions take a raw {@link DB}
 * handle and are intentionally NOT clinic-scoped. That power is gated at the
 * route layer: every caller MUST pass `getAdminSession()` first (see
 * `src/server/admin.ts`), so nothing here is reachable by a coach or aluno.
 *
 * Split by domain — one file per admin surface. Callers keep reaching everything
 * through `import { admin } from "@/server/dal"`, so this barrel must re-export
 * the full public surface flatly.
 */
export * from "./clinics";
export * from "./admins";
export * from "./foods";
export * from "./exercises";
export * from "./anamneses";
export * from "./templates";
export * from "./limits";
