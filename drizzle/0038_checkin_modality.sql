ALTER TABLE "student_checkin" ADD COLUMN "modality" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
UPDATE "student_checkin" SET "modality" = 'in_person' WHERE "author" = 'coach';
