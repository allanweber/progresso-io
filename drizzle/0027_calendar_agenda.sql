CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid,
	"coach_id" text,
	"type" text DEFAULT 'presencial' NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "calendar_override" boolean;--> statement-breakpoint
ALTER TABLE "plan_limit" ADD COLUMN "calendar" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- The Calendar/Agenda is a paid-tier feature: Free clinics are excluded, every
-- paid plan (Solo/Clínica/Enterprise) gets it. (plan_limit rows are ensured by
-- migration 0025.)
UPDATE "plan_limit" SET "calendar" = false WHERE "plan" = 'free';--> statement-breakpoint
UPDATE "plan_limit" SET "calendar" = true  WHERE "plan" IN ('solo','clinica','enterprise');--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_clinic_date_idx" ON "calendar_event" USING btree ("clinic_id","date");--> statement-breakpoint
CREATE INDEX "calendar_event_student_idx" ON "calendar_event" USING btree ("student_id");