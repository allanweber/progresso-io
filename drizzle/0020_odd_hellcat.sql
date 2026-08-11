CREATE TABLE "checkin_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"assessed_at" date NOT NULL,
	"circumferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skinfolds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_fat_pct" double precision,
	"recorded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_assessment_checkin_uq" UNIQUE("checkin_id")
);
--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "feedback_at" timestamp;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "feedback_by_user_id" text;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkin_assessment_clinic_idx" ON "checkin_assessment" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "checkin_assessment_student_idx" ON "checkin_assessment" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_feedback_by_user_id_user_id_fk" FOREIGN KEY ("feedback_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;