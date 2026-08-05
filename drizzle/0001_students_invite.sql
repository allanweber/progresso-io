CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "plan_limit" (
	"plan" text PRIMARY KEY NOT NULL,
	"max_students" integer
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "first_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "last_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "modality" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "name";