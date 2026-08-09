CREATE TABLE "student_workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_workout_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_workout_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_workout_id" uuid NOT NULL,
	"version" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"tree" jsonb NOT NULL,
	"notes" text,
	"published_at" timestamp,
	"published_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_workout_version_number_uq" UNIQUE("student_workout_id","version")
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"coach_id" text,
	"name" text NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sets" integer NOT NULL,
	"reps" jsonb NOT NULL,
	"load" text,
	"rest" integer DEFAULT 90 NOT NULL,
	"technique" text,
	"group_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workout_exercise_sets_positive" CHECK ("workout_exercise"."sets" > 0)
);
--> statement-breakpoint
CREATE TABLE "workout_exercise_substitute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"substitute_exercise_id" uuid NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_workout" ADD CONSTRAINT "student_workout_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout" ADD CONSTRAINT "student_workout_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout" ADD CONSTRAINT "student_workout_source_workout_id_workout_id_fk" FOREIGN KEY ("source_workout_id") REFERENCES "public"."workout"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout_version" ADD CONSTRAINT "student_workout_version_student_workout_id_student_workout_id_fk" FOREIGN KEY ("student_workout_id") REFERENCES "public"."student_workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout_version" ADD CONSTRAINT "student_workout_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_workout_session_id_workout_session_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise_substitute" ADD CONSTRAINT "workout_exercise_substitute_workout_exercise_id_workout_exercise_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise_substitute" ADD CONSTRAINT "workout_exercise_substitute_substitute_exercise_id_exercise_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_workout_id_workout_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_workout_clinic_idx" ON "student_workout" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_workout_student_idx" ON "student_workout" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_workout_version_workout_idx" ON "student_workout_version" USING btree ("student_workout_id");--> statement-breakpoint
CREATE INDEX "workout_clinic_idx" ON "workout" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "workout_exercise_session_idx" ON "workout_exercise" USING btree ("workout_session_id");--> statement-breakpoint
CREATE INDEX "workout_exercise_exercise_idx" ON "workout_exercise" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_ex_sub_item_idx" ON "workout_exercise_substitute" USING btree ("workout_exercise_id");--> statement-breakpoint
CREATE INDEX "workout_ex_sub_exercise_idx" ON "workout_exercise_substitute" USING btree ("substitute_exercise_id");--> statement-breakpoint
CREATE INDEX "workout_session_workout_idx" ON "workout_session" USING btree ("workout_id");