CREATE TABLE "coach_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "plan_limit" ADD COLUMN "max_coaches" integer;--> statement-breakpoint
ALTER TABLE "plan_limit" ADD COLUMN "whatsapp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_invitation" ADD CONSTRAINT "coach_invitation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_invitation" ADD CONSTRAINT "coach_invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_invitation_clinic_idx" ON "coach_invitation" USING btree ("clinic_id");