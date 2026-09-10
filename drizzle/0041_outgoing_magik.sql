CREATE TABLE "checkin_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"ai_generation_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"body_fat_pct" double precision,
	"body_fat_source" text,
	"confidence" text,
	"decided_by_user_id" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_evaluation_checkin_uq" UNIQUE("checkin_id")
);
--> statement-breakpoint
CREATE TABLE "student_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"checkin_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"acceptance" text,
	"body_fat_pct" double precision,
	"author_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "vision_model" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "vision_fallback_models" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD COLUMN "body_fat_source" text;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD COLUMN "protocol" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "assessment_preset" text DEFAULT 'completa' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_ai_generation_id_ai_generation_id_fk" FOREIGN KEY ("ai_generation_id") REFERENCES "public"."ai_generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkin_evaluation_clinic_idx" ON "checkin_evaluation" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "checkin_evaluation_student_idx" ON "checkin_evaluation" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_note_clinic_idx" ON "student_note" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_note_student_created_idx" ON "student_note" USING btree ("student_id","created_at");