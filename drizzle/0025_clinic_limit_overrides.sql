ALTER TABLE "clinic" ADD COLUMN "max_students_override" integer;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "max_coaches_override" integer;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "whatsapp_override" boolean;--> statement-breakpoint
-- Establish the canonical per-plan defaults. Migration 0024 added
-- max_coaches/whatsapp without backfilling, and a deployed plan_limit may be
-- missing rows entirely, so a plain UPDATE isn't enough — upsert so the row is
-- created when absent and corrected when present (matches src/db/seed.ts).
-- Per-clinic overrides sit on top of these defaults.
INSERT INTO "plan_limit" ("plan","max_students","max_coaches","whatsapp") VALUES ('free',3,1,false)
  ON CONFLICT ("plan") DO UPDATE SET "max_students"=EXCLUDED."max_students","max_coaches"=EXCLUDED."max_coaches","whatsapp"=EXCLUDED."whatsapp";--> statement-breakpoint
INSERT INTO "plan_limit" ("plan","max_students","max_coaches","whatsapp") VALUES ('solo',50,1,true)
  ON CONFLICT ("plan") DO UPDATE SET "max_students"=EXCLUDED."max_students","max_coaches"=EXCLUDED."max_coaches","whatsapp"=EXCLUDED."whatsapp";--> statement-breakpoint
INSERT INTO "plan_limit" ("plan","max_students","max_coaches","whatsapp") VALUES ('clinica',100,3,true)
  ON CONFLICT ("plan") DO UPDATE SET "max_students"=EXCLUDED."max_students","max_coaches"=EXCLUDED."max_coaches","whatsapp"=EXCLUDED."whatsapp";--> statement-breakpoint
INSERT INTO "plan_limit" ("plan","max_students","max_coaches","whatsapp") VALUES ('enterprise',NULL,NULL,true)
  ON CONFLICT ("plan") DO UPDATE SET "max_students"=EXCLUDED."max_students","max_coaches"=EXCLUDED."max_coaches","whatsapp"=EXCLUDED."whatsapp";
