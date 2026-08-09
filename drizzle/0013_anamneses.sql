CREATE TABLE "anamnesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"coach_id" text,
	"name" text NOT NULL,
	"description" text,
	"objective" text NOT NULL,
	"modality" text NOT NULL,
	"sections" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anamnesis" ADD CONSTRAINT "anamnesis_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnesis" ADD CONSTRAINT "anamnesis_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anamnesis_clinic_idx" ON "anamnesis" USING btree ("clinic_id");