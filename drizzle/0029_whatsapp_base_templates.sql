-- Templates move to a base (clinic_id NULL) + clinic-override model. The old
-- per-clinic seeded rows are replaced by the global base seed; there is no
-- template CRUD, so clearing seed data here is safe.
DELETE FROM "whatsapp_template";--> statement-breakpoint
ALTER TABLE "whatsapp_template" ALTER COLUMN "clinic_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_template_base_key_uq" ON "whatsapp_template" USING btree ("key") WHERE "whatsapp_template"."clinic_id" is null;
