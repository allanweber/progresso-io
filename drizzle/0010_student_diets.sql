CREATE TABLE "student_diet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_diet_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_diet_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_diet_id" uuid NOT NULL,
	"version" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"tree" jsonb NOT NULL,
	"notes" text,
	"published_at" timestamp,
	"published_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_diet_version_number_uq" UNIQUE("student_diet_id","version")
);
--> statement-breakpoint
ALTER TABLE "student_diet" ADD CONSTRAINT "student_diet_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet" ADD CONSTRAINT "student_diet_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet" ADD CONSTRAINT "student_diet_source_diet_id_diet_id_fk" FOREIGN KEY ("source_diet_id") REFERENCES "public"."diet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet_version" ADD CONSTRAINT "student_diet_version_student_diet_id_student_diet_id_fk" FOREIGN KEY ("student_diet_id") REFERENCES "public"."student_diet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet_version" ADD CONSTRAINT "student_diet_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_diet_clinic_idx" ON "student_diet" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_diet_student_idx" ON "student_diet" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_diet_version_diet_idx" ON "student_diet_version" USING btree ("student_diet_id");