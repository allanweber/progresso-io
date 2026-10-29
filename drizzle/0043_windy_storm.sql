ALTER TABLE "exercise" ADD COLUMN "opengym_id" text;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_opengym_id_unique" UNIQUE("opengym_id");