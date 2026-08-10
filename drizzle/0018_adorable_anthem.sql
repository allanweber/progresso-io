ALTER TABLE "clinic" ADD COLUMN "portal_subdomain" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "feedback_frequency" text DEFAULT 'semanal' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "feedback_preferred_day" text DEFAULT 'monday' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "feedback_whatsapp_reminder" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_portal_subdomain_uq" ON "clinic" USING btree ("portal_subdomain") WHERE "clinic"."portal_subdomain" is not null;