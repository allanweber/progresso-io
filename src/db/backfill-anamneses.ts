/**
 * One-off backfill: give every EXISTING clinic its own copy of the starter
 * anamneses. New clinics already get them at creation (the sign-up hook), but
 * clinics created before the anamnese feature have none — this seeds them.
 *
 * Idempotent: `seedClinicAnamneses` skips any clinic that already has at least
 * one anamnese, so re-running is safe and only ever touches empty clinics.
 *
 *   DATABASE_URL=… npm run db:backfill-anamneses
 */
import { db, schema } from "@/db";
import { seedClinicAnamneses } from "@/server/dal/anamneses";

async function main() {
  const clinics = await db
    .select({ id: schema.clinic.id, ownerUserId: schema.clinic.ownerUserId })
    .from(schema.clinic);

  let seededClinics = 0;
  let seededRows = 0;
  let skipped = 0;

  for (const clinic of clinics) {
    const n = await seedClinicAnamneses(db, clinic.id, clinic.ownerUserId);
    if (n > 0) {
      seededClinics += 1;
      seededRows += n;
      console.info(`✓ clinic ${clinic.id}: seeded ${n} anamneses`);
    } else {
      skipped += 1;
    }
  }

  console.info(
    `Backfill complete: ${seededRows} anamneses across ${seededClinics} clinic(s); ` +
      `${skipped} clinic(s) already had them.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
