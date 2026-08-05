CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE TABLE "food" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"description" text NOT NULL,
	"search_text" text NOT NULL,
	"group_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text DEFAULT 'TBCA' NOT NULL,
	"clinic_id" uuid,
	"energy_kcal" double precision,
	"protein" double precision,
	"carbohydrate" double precision,
	"fat" double precision,
	"fiber" double precision,
	"sodium" double precision,
	"archived" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "food_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "food_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "food_group_name_unique" UNIQUE("name"),
	CONSTRAINT "food_group_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "food_nutrient" (
	"food_id" uuid NOT NULL,
	"nutrient_id" text NOT NULL,
	"value" double precision,
	"is_trace" boolean DEFAULT false NOT NULL,
	CONSTRAINT "food_nutrient_food_id_nutrient_id_pk" PRIMARY KEY("food_id","nutrient_id")
);
--> statement-breakpoint
CREATE TABLE "food_substitution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"food_id" uuid NOT NULL,
	"substitute_food_id" uuid NOT NULL,
	"grams" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "food_sub_grams_positive" CHECK ("food_substitution"."grams" > 0),
	CONSTRAINT "food_sub_not_self" CHECK ("food_substitution"."food_id" <> "food_substitution"."substitute_food_id")
);
--> statement-breakpoint
CREATE TABLE "nutrient" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_group_id_food_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."food_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrient" ADD CONSTRAINT "food_nutrient_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrient" ADD CONSTRAINT "food_nutrient_nutrient_id_nutrient_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution" ADD CONSTRAINT "food_substitution_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution" ADD CONSTRAINT "food_substitution_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution" ADD CONSTRAINT "food_substitution_substitute_food_id_food_id_fk" FOREIGN KEY ("substitute_food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_group_idx" ON "food" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "food_type_idx" ON "food" USING btree ("type");--> statement-breakpoint
CREATE INDEX "food_clinic_idx" ON "food" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "food_nutrient_nutrient_idx" ON "food_nutrient" USING btree ("nutrient_id");--> statement-breakpoint
CREATE INDEX "food_sub_lookup_idx" ON "food_substitution" USING btree ("clinic_id","food_id");--> statement-breakpoint
CREATE INDEX "food_search_trgm" ON "food" USING gin ("search_text" gin_trgm_ops);