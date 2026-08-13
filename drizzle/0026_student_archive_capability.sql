ALTER TABLE "clinic" ADD COLUMN "archive_override" boolean;--> statement-breakpoint
ALTER TABLE "plan_limit" ADD COLUMN "archive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Archiving is a paid-tier feature: Free/Solo hard-delete students instead.
-- (plan_limit rows are ensured by migration 0025.)
UPDATE "plan_limit" SET "archive" = false WHERE "plan" IN ('free','solo');--> statement-breakpoint
UPDATE "plan_limit" SET "archive" = true  WHERE "plan" IN ('clinica','enterprise');
