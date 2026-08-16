-- 14-day trial (roadmap item 0, Phase 1).
--
-- `trial_ends_at`: while it is in the future AND the clinic is still on `free`,
-- the clinic resolves to Solo limits. Deliberately not a `plan` value, so the
-- stored plan stays honest and `clinic_plan_change` remains an audit of real
-- plan changes; expiry is a pure date comparison, correct with no cron running.
-- Existing clinics are NOT backfilled (NULL = never had a trial).
--
-- `intended_plan`: the plan chosen in the sign-up wizard. Recorded as intent
-- only — never granted — so the manual fatura bills the right plan.
ALTER TABLE "clinic" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "intended_plan" text;