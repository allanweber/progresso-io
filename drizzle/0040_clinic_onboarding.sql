ALTER TABLE "clinic" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
-- Backfill: every clinic that exists today predates the setup guide and already
-- has its starters seeded, so none of them is owed one. Without this they would
-- all be redirected into a wizard on next sign-in — ambushing active coaches
-- with setup they finished months ago. NULL from here on means "new clinic".
UPDATE "clinic" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;
