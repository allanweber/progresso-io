CREATE TABLE "diet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"coach_id" text,
	"name" text NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diet_meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diet_id" uuid NOT NULL,
	"name" text NOT NULL,
	"time" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diet_meal_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diet_meal_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"grams" double precision NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "diet_meal_item_grams_positive" CHECK ("diet_meal_item"."grams" > 0)
);
--> statement-breakpoint
CREATE TABLE "diet_meal_item_substitute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diet_meal_item_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"grams" double precision NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "diet_item_sub_grams_positive" CHECK ("diet_meal_item_substitute"."grams" > 0)
);
--> statement-breakpoint
ALTER TABLE "diet" ADD CONSTRAINT "diet_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet" ADD CONSTRAINT "diet_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal" ADD CONSTRAINT "diet_meal_diet_id_diet_id_fk" FOREIGN KEY ("diet_id") REFERENCES "public"."diet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item" ADD CONSTRAINT "diet_meal_item_diet_meal_id_diet_meal_id_fk" FOREIGN KEY ("diet_meal_id") REFERENCES "public"."diet_meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item" ADD CONSTRAINT "diet_meal_item_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item_substitute" ADD CONSTRAINT "diet_meal_item_substitute_diet_meal_item_id_diet_meal_item_id_fk" FOREIGN KEY ("diet_meal_item_id") REFERENCES "public"."diet_meal_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item_substitute" ADD CONSTRAINT "diet_meal_item_substitute_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diet_clinic_idx" ON "diet" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "diet_meal_diet_idx" ON "diet_meal" USING btree ("diet_id");--> statement-breakpoint
CREATE INDEX "diet_meal_item_meal_idx" ON "diet_meal_item" USING btree ("diet_meal_id");--> statement-breakpoint
CREATE INDEX "diet_meal_item_food_idx" ON "diet_meal_item" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "diet_item_sub_item_idx" ON "diet_meal_item_substitute" USING btree ("diet_meal_item_id");--> statement-breakpoint
CREATE INDEX "diet_item_sub_food_idx" ON "diet_meal_item_substitute" USING btree ("food_id");