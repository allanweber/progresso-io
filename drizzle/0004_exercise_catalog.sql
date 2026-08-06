CREATE TABLE "exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"search_text" text NOT NULL,
	"category" text NOT NULL,
	"level" text NOT NULL,
	"force" text,
	"mechanic" text,
	"equipment" text,
	"primary_muscles" text[] DEFAULT '{}' NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}' NOT NULL,
	"instructions" text[] DEFAULT '{}' NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'free-exercise-db' NOT NULL,
	"clinic_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_category_idx" ON "exercise" USING btree ("category");--> statement-breakpoint
CREATE INDEX "exercise_clinic_idx" ON "exercise" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "exercise_search_trgm" ON "exercise" USING gin ("search_text" gin_trgm_ops);