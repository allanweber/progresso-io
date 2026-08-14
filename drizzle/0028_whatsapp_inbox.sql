CREATE TABLE "whatsapp_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"provider" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"phone" text,
	"meta_account_name" text,
	"connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid,
	"phone" text NOT NULL,
	"last_inbound_at" timestamp,
	"last_message_at" timestamp,
	"last_message_preview" text,
	"last_message_direction" text,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"template_key" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"provider_message_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_connection" ADD CONSTRAINT "whatsapp_connection_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_conversation_id_whatsapp_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_template" ADD CONSTRAINT "whatsapp_template_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connection_clinic_uq" ON "whatsapp_connection" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_clinic_phone_uq" ON "whatsapp_conversation" USING btree ("clinic_id","phone");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_clinic_last_idx" ON "whatsapp_conversation" USING btree ("clinic_id","last_message_at");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_student_idx" ON "whatsapp_conversation" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_clinic_conv_idx" ON "whatsapp_message" USING btree ("clinic_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_message_provider_idx" ON "whatsapp_message" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_template_clinic_key_uq" ON "whatsapp_template" USING btree ("clinic_id","key");