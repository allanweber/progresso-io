CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_read" (
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_read_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "student_anamnesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"source_anamnesis_id" uuid,
	"name" text NOT NULL,
	"sections" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filled_by" text,
	"filled_at" timestamp,
	"fill_token_hash" text,
	"fill_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_anamnesis_fill_token_hash_unique" UNIQUE("fill_token_hash"),
	CONSTRAINT "student_anamnesis_student_uq" UNIQUE("student_id")
);
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_clinic_id_email_unique";--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_anamnesis" ADD CONSTRAINT "student_anamnesis_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_anamnesis" ADD CONSTRAINT "student_anamnesis_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_anamnesis" ADD CONSTRAINT "student_anamnesis_source_anamnesis_id_anamnesis_id_fk" FOREIGN KEY ("source_anamnesis_id") REFERENCES "public"."anamnesis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_clinic_idx" ON "notification" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_anamnesis_clinic_idx" ON "student_anamnesis" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_clinic_phone_uq" ON "students" USING btree ("clinic_id","phone") WHERE "students"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "students_clinic_email_uq" ON "students" USING btree ("clinic_id","email") WHERE "students"."email" is not null;