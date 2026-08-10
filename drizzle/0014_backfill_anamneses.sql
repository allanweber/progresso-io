-- Intentionally a no-op.
--
-- This migration originally backfilled every existing clinic with a copy of the
-- starter anamneses. It has been blanked so it never seeds on a fresh install:
-- new clinics get their starters from the sign-up hook, and a platform admin
-- provisions/repairs any clinic from the "Manutenção → Anamneses" page (import
-- starters). The file + journal entry are kept so the migration sequence and
-- already-applied databases stay intact (the migrator won't re-run it).
SELECT 1;
