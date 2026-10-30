ALTER TABLE "exercise" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "exercise" ADD COLUMN "instructions_en" text[] DEFAULT '{}' NOT NULL;