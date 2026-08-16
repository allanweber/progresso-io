-- AI Program Generator (growth-roadmap item 1). See docs/ai-generator.md.
--
-- `ai_generation` is the quota meter, the audit trail and the cost ledger at
-- once. The monthly cap is a count of these rows, never a counter column, so it
-- cannot drift and needs no cron to reset. Rows are written `pending` before the
-- model call and settled after, which is what makes a failed generation free
-- while still stopping two concurrent requests from sharing one credit.
CREATE TABLE "ai_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"coach_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"cost_micro_usd" integer,
	"duration_ms" integer,
	"repaired" boolean DEFAULT false NOT NULL,
	"catalog_hash" text,
	"anamnesis_snapshot_id" uuid,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "ai_generations_override" integer;--> statement-breakpoint
ALTER TABLE "plan_limit" ADD COLUMN "ai_generations" integer;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_anamnesis_snapshot_id_student_anamnesis_id_fk" FOREIGN KEY ("anamnesis_snapshot_id") REFERENCES "public"."student_anamnesis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_clinic_created_idx" ON "ai_generation" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generation_student_idx" ON "ai_generation" USING btree ("student_id");--> statement-breakpoint
-- Generations per calendar month. Free gets a real taste (1), Solo the working
-- allowance (10), Clínica the volume tier (25). Enterprise is NULL = unlimited,
-- negotiated per contract. Unlike the boolean capabilities this meters a genuine
-- marginal cost, so even the top self-serve plan carries a number.
-- (plan_limit rows are ensured by migration 0025.)
UPDATE "plan_limit" SET "ai_generations" = 1    WHERE "plan" = 'free';--> statement-breakpoint
UPDATE "plan_limit" SET "ai_generations" = 10   WHERE "plan" = 'solo';--> statement-breakpoint
UPDATE "plan_limit" SET "ai_generations" = 25   WHERE "plan" = 'clinica';--> statement-breakpoint
UPDATE "plan_limit" SET "ai_generations" = NULL WHERE "plan" = 'enterprise';