CREATE TABLE "exercise_substitution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"exercise_id" uuid NOT NULL,
	"substitute_exercise_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_sub_not_self" CHECK ("exercise_substitution"."exercise_id" <> "exercise_substitution"."substitute_exercise_id")
);
--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_substitute_exercise_id_exercise_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_sub_lookup_idx" ON "exercise_substitution" USING btree ("clinic_id","exercise_id");