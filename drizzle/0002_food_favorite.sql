CREATE TABLE "food_favorite" (
	"clinic_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "food_favorite_clinic_id_food_id_pk" PRIMARY KEY("clinic_id","food_id")
);
--> statement-breakpoint
ALTER TABLE "food_favorite" ADD CONSTRAINT "food_favorite_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_favorite" ADD CONSTRAINT "food_favorite_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_favorite_food_idx" ON "food_favorite" USING btree ("food_id");