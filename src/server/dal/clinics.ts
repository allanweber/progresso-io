import { eq } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Clinic, Plan } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/* -------------------------------------------------------------------------- */
/*  Bootstrap (no tenant yet — used to create the tenant itself)              */
/* -------------------------------------------------------------------------- */

/**
 * Creates a clinic owned by a user. This is a bootstrap operation (there is no
 * tenant context yet), so it takes a raw DB handle rather than a
 * {@link TenantContext}. Called from the sign-up hook in lib/auth.
 */
export async function createClinicForOwner(
  db: DB,
  input: { ownerUserId: string; name: string; plan?: Plan },
): Promise<Clinic> {
  const [clinic] = await db
    .insert(schema.clinic)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name,
      plan: input.plan ?? "free",
    })
    .returning();
  return clinic;
}

/** Attaches a user to a clinic (bootstrap). */
export async function attachUserToClinic(
  db: DB,
  userId: string,
  clinicId: string,
): Promise<void> {
  await db
    .update(schema.user)
    .set({ clinicId })
    .where(eq(schema.user.id, userId));
}

/* -------------------------------------------------------------------------- */
/*  Tenant-scoped                                                             */
/* -------------------------------------------------------------------------- */

/** The current tenant's clinic. */
export async function getClinic(ctx: TenantContext): Promise<Clinic | null> {
  const [clinic] = await ctx.db
    .select()
    .from(schema.clinic)
    .where(eq(schema.clinic.id, ctx.clinicId));
  return clinic ?? null;
}
