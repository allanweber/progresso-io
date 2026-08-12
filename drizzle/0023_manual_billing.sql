CREATE TABLE "clinic_plan_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"from_plan" text,
	"to_plan" text NOT NULL,
	"changed_by" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"competencia" date NOT NULL,
	"issued_at" date NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" date,
	"payment_method" text,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"plan_snapshot" text NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_plan_change" ADD CONSTRAINT "clinic_plan_change_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_plan_change" ADD CONSTRAINT "clinic_plan_change_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinic_plan_change_clinic_idx" ON "clinic_plan_change" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "invoice_clinic_idx" ON "invoice" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_uq" ON "invoice" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoice_line_item_invoice_idx" ON "invoice_line_item" USING btree ("invoice_id");