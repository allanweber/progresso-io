ALTER TABLE "student_checkin" ADD COLUMN "diet_version_id" uuid;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "diet_name" text;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "diet_version" integer;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "workout_version_id" uuid;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "workout_name" text;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD COLUMN "workout_version" integer;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_diet_version_id_student_diet_version_id_fk" FOREIGN KEY ("diet_version_id") REFERENCES "public"."student_diet_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_workout_version_id_student_workout_version_id_fk" FOREIGN KEY ("workout_version_id") REFERENCES "public"."student_workout_version"("id") ON DELETE set null ON UPDATE no action;