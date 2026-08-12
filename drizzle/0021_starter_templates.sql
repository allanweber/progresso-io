ALTER TABLE "clinic" ADD COLUMN "starters_seeded_at" timestamp;--> statement-breakpoint
ALTER TABLE "diet" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "workout" ADD COLUMN "source_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "diet_clinic_source_uq" ON "diet" USING btree ("clinic_id","source_key") WHERE "diet"."source_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_clinic_source_uq" ON "workout" USING btree ("clinic_id","source_key") WHERE "workout"."source_key" is not null;