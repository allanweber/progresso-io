CREATE TABLE "student_checkin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"author" text DEFAULT 'student' NOT NULL,
	"author_user_id" text,
	"weight_kg" double precision,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_checkin_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"pose" text NOT NULL,
	"r2_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "student_checkin_photo_pose_uq" UNIQUE("checkin_id","pose")
);
--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin_photo" ADD CONSTRAINT "student_checkin_photo_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin_photo" ADD CONSTRAINT "student_checkin_photo_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_checkin_clinic_idx" ON "student_checkin" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_checkin_student_date_idx" ON "student_checkin" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "student_checkin_photo_checkin_idx" ON "student_checkin_photo" USING btree ("checkin_id");