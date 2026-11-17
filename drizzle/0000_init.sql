CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ai_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"coach_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"upstream_provider" text,
	"request_id" text,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"cache_write_tokens" integer,
	"output_tokens" integer,
	"reported_cost_micro_usd" integer,
	"duration_ms" integer,
	"repaired" boolean DEFAULT false NOT NULL,
	"catalog_hash" text,
	"anamnesis_snapshot_id" uuid,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generation_kind_check" CHECK ("ai_generation"."kind" in ('workout', 'diet', 'evaluation')),
	CONSTRAINT "ai_generation_status_check" CHECK ("ai_generation"."status" in ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"model" text NOT NULL,
	"fallback_models" text[] DEFAULT '{}' NOT NULL,
	"vision_model" text,
	"vision_fallback_models" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_singleton_unique" UNIQUE("singleton")
);
--> statement-breakpoint
CREATE TABLE "anamnesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"coach_id" text,
	"source_key" text,
	"name" text NOT NULL,
	"description" text,
	"objective" text NOT NULL,
	"modality" text NOT NULL,
	"sections" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anamnesis_objective_check" CHECK ("anamnesis"."objective" in ('weight_loss', 'hypertrophy', 'health', 'clinical', 'womens_health')),
	CONSTRAINT "anamnesis_modality_check" CHECK ("anamnesis"."modality" in ('in_person', 'online', 'any'))
);
--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid,
	"coach_id" text,
	"type" text DEFAULT 'presencial' NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_type_check" CHECK ("calendar_event"."type" in ('checkin', 'presencial', 'admin')),
	CONSTRAINT "calendar_event_time_format" CHECK (("calendar_event"."start_time" is null or "calendar_event"."start_time" ~ '^[0-2][0-9]:[0-5][0-9]$') and ("calendar_event"."end_time" is null or "calendar_event"."end_time" ~ '^[0-2][0-9]:[0-5][0-9]$'))
);
--> statement-breakpoint
CREATE TABLE "checkin_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"assessed_at" date NOT NULL,
	"protocol" text NOT NULL,
	"circumferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skinfolds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_fat_pct" double precision,
	"body_fat_source" text,
	"recorded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_assessment_checkin_uq" UNIQUE("checkin_id"),
	CONSTRAINT "checkin_assessment_protocol_check" CHECK ("checkin_assessment"."protocol" in ('completa', 'basica', 'so_peso', 'personalizada')),
	CONSTRAINT "checkin_assessment_body_fat_source_check" CHECK ("checkin_assessment"."body_fat_source" is null or "checkin_assessment"."body_fat_source" in ('skinfolds', 'estimate', 'manual')),
	CONSTRAINT "checkin_assessment_body_fat_pair" CHECK (("checkin_assessment"."body_fat_pct" is null) = ("checkin_assessment"."body_fat_source" is null))
);
--> statement-breakpoint
CREATE TABLE "checkin_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"ai_generation_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"body_fat_pct" double precision,
	"body_fat_source" text,
	"confidence" text,
	"decided_by_user_id" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_evaluation_checkin_uq" UNIQUE("checkin_id"),
	CONSTRAINT "checkin_evaluation_status_check" CHECK ("checkin_evaluation"."status" in ('pending', 'accepted', 'discarded')),
	CONSTRAINT "checkin_evaluation_body_fat_source_check" CHECK ("checkin_evaluation"."body_fat_source" is null or "checkin_evaluation"."body_fat_source" in ('skinfolds', 'estimate', 'manual')),
	CONSTRAINT "checkin_evaluation_confidence_check" CHECK ("checkin_evaluation"."confidence" is null or "checkin_evaluation"."confidence" in ('baixa', 'media', 'alta'))
);
--> statement-breakpoint
CREATE TABLE "clinic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"intended_plan" text,
	"trial_ends_at" timestamp,
	"owner_user_id" text NOT NULL,
	"portal_slug" text,
	"logo_key" text,
	"headline" text,
	"description" text,
	"whatsapp" text,
	"instagram" text,
	"site_url" text,
	"accent_color" text,
	"feedback_frequency" text DEFAULT 'semanal' NOT NULL,
	"feedback_preferred_day" text DEFAULT 'monday' NOT NULL,
	"feedback_whatsapp_reminder" boolean DEFAULT true NOT NULL,
	"assessment_preset" text DEFAULT 'completa' NOT NULL,
	"max_students_override" integer,
	"max_coaches_override" integer,
	"whatsapp_override" boolean,
	"archive_override" boolean,
	"calendar_override" boolean,
	"ai_generations_override" integer,
	"starters_seeded_at" timestamp,
	"onboarding_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_plan_check" CHECK ("clinic"."plan" in ('free', 'solo', 'clinica', 'enterprise')),
	CONSTRAINT "clinic_intended_plan_check" CHECK ("clinic"."intended_plan" is null or "clinic"."intended_plan" in ('free', 'solo', 'clinica', 'enterprise')),
	CONSTRAINT "clinic_feedback_frequency_check" CHECK ("clinic"."feedback_frequency" in ('semanal', 'quinzenal', 'mensal')),
	CONSTRAINT "clinic_feedback_preferred_day_check" CHECK ("clinic"."feedback_preferred_day" in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
	CONSTRAINT "clinic_assessment_preset_check" CHECK ("clinic"."assessment_preset" in ('completa', 'basica', 'so_peso', 'personalizada'))
);
--> statement-breakpoint
CREATE TABLE "clinic_plan_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"from_plan" text,
	"to_plan" text NOT NULL,
	"changed_by" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_plan_change_from_check" CHECK ("clinic_plan_change"."from_plan" is null or "clinic_plan_change"."from_plan" in ('free', 'solo', 'clinica', 'enterprise')),
	CONSTRAINT "clinic_plan_change_to_check" CHECK ("clinic_plan_change"."to_plan" in ('free', 'solo', 'clinica', 'enterprise'))
);
--> statement-breakpoint
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
CREATE TABLE "diet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"coach_id" text,
	"source_key" text,
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
	"measure_label" text,
	"measure_grams" double precision,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "diet_meal_item_grams_positive" CHECK ("diet_meal_item"."grams" > 0),
	CONSTRAINT "diet_meal_item_measure_pair" CHECK (("diet_meal_item"."measure_label" is null) = ("diet_meal_item"."measure_grams" is null))
);
--> statement-breakpoint
CREATE TABLE "diet_meal_item_substitute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diet_meal_item_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"grams" double precision NOT NULL,
	"measure_label" text,
	"measure_grams" double precision,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "diet_item_sub_grams_positive" CHECK ("diet_meal_item_substitute"."grams" > 0),
	CONSTRAINT "diet_item_sub_measure_pair" CHECK (("diet_meal_item_substitute"."measure_label" is null) = ("diet_meal_item_substitute"."measure_grams" is null))
);
--> statement-breakpoint
CREATE TABLE "exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"name_en" text,
	"description" text,
	"search_text" text NOT NULL,
	"category" text NOT NULL,
	"level" text NOT NULL,
	"force" text,
	"mechanic" text,
	"equipment" text,
	"primary_muscles" text[] DEFAULT '{}' NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}' NOT NULL,
	"instructions" text[] DEFAULT '{}' NOT NULL,
	"instructions_en" text[] DEFAULT '{}' NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"image_credits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"opengym_id" text,
	"clinic_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_code_unique" UNIQUE("code"),
	CONSTRAINT "exercise_opengym_id_unique" UNIQUE("opengym_id"),
	CONSTRAINT "exercise_category_check" CHECK ("exercise"."category" in ('strength', 'stretching', 'plyometrics', 'strongman', 'powerlifting', 'cardio', 'olympic_weightlifting')),
	CONSTRAINT "exercise_level_check" CHECK ("exercise"."level" in ('beginner', 'intermediate', 'expert')),
	CONSTRAINT "exercise_force_check" CHECK ("exercise"."force" is null or "exercise"."force" in ('pull', 'push', 'static')),
	CONSTRAINT "exercise_mechanic_check" CHECK ("exercise"."mechanic" is null or "exercise"."mechanic" in ('compound', 'isolation')),
	CONSTRAINT "exercise_equipment_check" CHECK ("exercise"."equipment" is null or "exercise"."equipment" in ('body_only', 'machine', 'other', 'foam_roll', 'kettlebells', 'dumbbell', 'cable', 'barbell', 'bands', 'medicine_ball', 'exercise_ball', 'e_z_curl_bar')),
	CONSTRAINT "exercise_primary_muscles_check" CHECK ("exercise"."primary_muscles" <@ array['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower_back', 'middle_back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps']::text[]),
	CONSTRAINT "exercise_secondary_muscles_check" CHECK ("exercise"."secondary_muscles" <@ array['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower_back', 'middle_back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps']::text[]),
	CONSTRAINT "exercise_opengym_id_format" CHECK ("exercise"."opengym_id" is null or "exercise"."opengym_id" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
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
CREATE TABLE "food" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"description" text NOT NULL,
	"search_text" text NOT NULL,
	"group_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
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
	CONSTRAINT "food_code_unique" UNIQUE("code"),
	CONSTRAINT "food_type_check" CHECK ("food"."type" in ('ingrediente', 'preparacao'))
);
--> statement-breakpoint
CREATE TABLE "food_favorite" (
	"clinic_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "food_favorite_clinic_id_food_id_pk" PRIMARY KEY("clinic_id","food_id")
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
CREATE TABLE "food_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"food_id" uuid NOT NULL,
	"label" text NOT NULL,
	"grams" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "food_measure_grams_positive" CHECK ("food_measure"."grams" > 0)
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
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_status_check" CHECK ("invoice"."status" in ('pending', 'paid', 'canceled')),
	CONSTRAINT "invoice_payment_method_check" CHECK ("invoice"."payment_method" is null or "invoice"."payment_method" in ('pix', 'boleto', 'cartao', 'transferencia', 'outro')),
	CONSTRAINT "invoice_plan_snapshot_check" CHECK ("invoice"."plan_snapshot" in ('free', 'solo', 'clinica', 'enterprise')),
	CONSTRAINT "invoice_discount_non_negative" CHECK ("invoice"."discount_cents" >= 0)
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
CREATE TABLE "invoice_reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reminder_date" date NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_reminder_channel_check" CHECK ("invoice_reminder"."channel" in ('whatsapp', 'email'))
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_type_check" CHECK ("notification"."type" in ('anamnesis_completed', 'checkin_submitted', 'whatsapp_received', 'student_checkin_inactive'))
);
--> statement-breakpoint
CREATE TABLE "notification_read" (
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_read_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "nutrient" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "nutrient_kind_check" CHECK ("nutrient"."kind" in ('energy', 'macro', 'mineral', 'vitamin', 'fatty_acid', 'amino_acid', 'other'))
);
--> statement-breakpoint
CREATE TABLE "plan_limit" (
	"plan" text PRIMARY KEY NOT NULL,
	"max_students" integer,
	"max_coaches" integer,
	"whatsapp" boolean DEFAULT true NOT NULL,
	"archive" boolean DEFAULT true NOT NULL,
	"calendar" boolean DEFAULT true NOT NULL,
	"ai_generations" integer,
	CONSTRAINT "plan_limit_plan_check" CHECK ("plan_limit"."plan" in ('free', 'solo', 'clinica', 'enterprise'))
);
--> statement-breakpoint
CREATE TABLE "provider_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effective_from" timestamp NOT NULL,
	"input_micro_usd_per_mtok" integer NOT NULL,
	"output_micro_usd_per_mtok" integer NOT NULL,
	"cached_input_micro_usd_per_mtok" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"coach_id" text,
	"user_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"goal" text,
	"sex" text,
	"birth_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"modality" text DEFAULT 'online' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_sex_check" CHECK ("student"."sex" is null or "student"."sex" in ('masculino', 'feminino')),
	CONSTRAINT "student_status_check" CHECK ("student"."status" in ('active', 'inactive', 'archived')),
	CONSTRAINT "student_modality_check" CHECK ("student"."modality" in ('online', 'in_person'))
);
--> statement-breakpoint
CREATE TABLE "student_anamnesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"source_anamnesis_id" uuid,
	"name" text NOT NULL,
	"sections" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filled_by" text,
	"filled_at" timestamp,
	"fill_token_hash" text,
	"fill_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_anamnesis_fill_token_hash_unique" UNIQUE("fill_token_hash"),
	CONSTRAINT "student_anamnesis_student_uq" UNIQUE("student_id"),
	CONSTRAINT "student_anamnesis_status_check" CHECK ("student_anamnesis"."status" in ('pending', 'completed')),
	CONSTRAINT "student_anamnesis_filled_by_check" CHECK ("student_anamnesis"."filled_by" is null or "student_anamnesis"."filled_by" in ('aluno', 'coach')),
	CONSTRAINT "student_anamnesis_token_pair" CHECK (("student_anamnesis"."fill_token_hash" is null) = ("student_anamnesis"."fill_token_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "student_checkin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"author" text NOT NULL,
	"modality" text NOT NULL,
	"author_user_id" text,
	"weight_kg" double precision,
	"note" text,
	"feedback" text,
	"feedback_at" timestamp,
	"feedback_by_user_id" text,
	"diet_version_id" uuid,
	"diet_name" text,
	"diet_version" integer,
	"workout_version_id" uuid,
	"workout_name" text,
	"workout_version" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_checkin_author_check" CHECK ("student_checkin"."author" in ('student', 'coach')),
	CONSTRAINT "student_checkin_modality_check" CHECK ("student_checkin"."modality" in ('online', 'in_person')),
	CONSTRAINT "student_checkin_weight_positive" CHECK ("student_checkin"."weight_kg" is null or "student_checkin"."weight_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "student_checkin_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"pose" text NOT NULL,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "student_checkin_photo_pose_uq" UNIQUE("checkin_id","pose"),
	CONSTRAINT "student_checkin_photo_pose_check" CHECK ("student_checkin_photo"."pose" in ('frente', 'costas', 'lado_esquerdo', 'lado_direito'))
);
--> statement-breakpoint
CREATE TABLE "student_diet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_diet_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_diet_status_check" CHECK ("student_diet"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "student_diet_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_diet_id" uuid NOT NULL,
	"version" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"tree" jsonb NOT NULL,
	"notes" text,
	"published_at" timestamp,
	"published_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_diet_version_number_uq" UNIQUE("student_diet_id","version"),
	CONSTRAINT "student_diet_version_status_check" CHECK ("student_diet_version"."status" in ('draft', 'published')),
	CONSTRAINT "student_diet_version_published_shape" CHECK (("student_diet_version"."status" = 'published') = ("student_diet_version"."version" is not null and "student_diet_version"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "student_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"checkin_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"acceptance" text,
	"body_fat_pct" double precision,
	"author_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_note_source_check" CHECK ("student_note"."source" in ('manual', 'ai_evaluation')),
	CONSTRAINT "student_note_acceptance_check" CHECK ("student_note"."acceptance" is null or "student_note"."acceptance" in ('accepted', 'accepted_edited')),
	CONSTRAINT "student_note_ai_shape" CHECK (("student_note"."source" = 'ai_evaluation') = ("student_note"."payload" is not null and "student_note"."acceptance" is not null))
);
--> statement-breakpoint
CREATE TABLE "student_workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_workout_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_workout_status_check" CHECK ("student_workout"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "student_workout_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_workout_id" uuid NOT NULL,
	"version" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"tree" jsonb NOT NULL,
	"notes" text,
	"cardio" text,
	"published_at" timestamp,
	"published_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_workout_version_number_uq" UNIQUE("student_workout_id","version"),
	CONSTRAINT "student_workout_version_status_check" CHECK ("student_workout_version"."status" in ('draft', 'published')),
	CONSTRAINT "student_workout_version_published_shape" CHECK (("student_workout_version"."status" = 'published') = ("student_workout_version"."version" is not null and "student_workout_version"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'coach' NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"clinic_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('coach', 'aluno', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"provider" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"phone" text,
	"meta_account_name" text,
	"connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_connection_clinic_uq" UNIQUE("clinic_id"),
	CONSTRAINT "whatsapp_connection_status_check" CHECK ("whatsapp_connection"."status" in ('connected', 'pending', 'disconnected'))
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversation_direction_check" CHECK ("whatsapp_conversation"."last_message_direction" is null or "whatsapp_conversation"."last_message_direction" in ('inbound', 'outbound')),
	CONSTRAINT "whatsapp_conversation_unread_non_negative" CHECK ("whatsapp_conversation"."unread_count" >= 0)
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_message_direction_check" CHECK ("whatsapp_message"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "whatsapp_message_type_check" CHECK ("whatsapp_message"."type" in ('text', 'template')),
	CONSTRAINT "whatsapp_message_status_check" CHECK ("whatsapp_message"."status" in ('queued', 'sent', 'delivered', 'read', 'failed', 'handed_off', 'dismissed')),
	CONSTRAINT "whatsapp_message_template_shape" CHECK (("whatsapp_message"."type" = 'template') = ("whatsapp_message"."template_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_template_status_check" CHECK ("whatsapp_template"."status" in ('approved', 'pending', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"coach_id" text,
	"source_key" text,
	"name" text NOT NULL,
	"notes" text,
	"cardio" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sets" integer NOT NULL,
	"reps" jsonb NOT NULL,
	"load" text,
	"rest" integer DEFAULT 90 NOT NULL,
	"note" text,
	"technique" text,
	"group_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workout_exercise_sets_positive" CHECK ("workout_exercise"."sets" > 0),
	CONSTRAINT "workout_exercise_rest_non_negative" CHECK ("workout_exercise"."rest" >= 0),
	CONSTRAINT "workout_exercise_technique_check" CHECK ("workout_exercise"."technique" is null or "workout_exercise"."technique" in ('dropset', 'tripledrop', 'gvt', 'fs7', 'restpause', 'cluster'))
);
--> statement-breakpoint
CREATE TABLE "workout_exercise_substitute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"substitute_exercise_id" uuid NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitation" ADD CONSTRAINT "admin_invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_anamnesis_snapshot_id_student_anamnesis_id_fk" FOREIGN KEY ("anamnesis_snapshot_id") REFERENCES "public"."student_anamnesis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnesis" ADD CONSTRAINT "anamnesis_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnesis" ADD CONSTRAINT "anamnesis_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_assessment" ADD CONSTRAINT "checkin_assessment_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_ai_generation_id_ai_generation_id_fk" FOREIGN KEY ("ai_generation_id") REFERENCES "public"."ai_generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_evaluation" ADD CONSTRAINT "checkin_evaluation_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic" ADD CONSTRAINT "clinic_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_plan_change" ADD CONSTRAINT "clinic_plan_change_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_plan_change" ADD CONSTRAINT "clinic_plan_change_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_invitation" ADD CONSTRAINT "coach_invitation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_invitation" ADD CONSTRAINT "coach_invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet" ADD CONSTRAINT "diet_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet" ADD CONSTRAINT "diet_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal" ADD CONSTRAINT "diet_meal_diet_id_diet_id_fk" FOREIGN KEY ("diet_id") REFERENCES "public"."diet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item" ADD CONSTRAINT "diet_meal_item_diet_meal_id_diet_meal_id_fk" FOREIGN KEY ("diet_meal_id") REFERENCES "public"."diet_meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item" ADD CONSTRAINT "diet_meal_item_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item_substitute" ADD CONSTRAINT "diet_meal_item_substitute_diet_meal_item_id_diet_meal_item_id_fk" FOREIGN KEY ("diet_meal_item_id") REFERENCES "public"."diet_meal_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_item_substitute" ADD CONSTRAINT "diet_meal_item_substitute_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitution" ADD CONSTRAINT "exercise_substitution_substitute_exercise_id_exercise_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_group_id_food_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."food_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_favorite" ADD CONSTRAINT "food_favorite_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_favorite" ADD CONSTRAINT "food_favorite_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_measure" ADD CONSTRAINT "food_measure_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_measure" ADD CONSTRAINT "food_measure_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrient" ADD CONSTRAINT "food_nutrient_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrient" ADD CONSTRAINT "food_nutrient_nutrient_id_nutrient_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution" ADD CONSTRAINT "food_substitution_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution" ADD CONSTRAINT "food_substitution_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution" ADD CONSTRAINT "food_substitution_substitute_food_id_food_id_fk" FOREIGN KEY ("substitute_food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminder" ADD CONSTRAINT "invoice_reminder_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_anamnesis" ADD CONSTRAINT "student_anamnesis_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_anamnesis" ADD CONSTRAINT "student_anamnesis_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_anamnesis" ADD CONSTRAINT "student_anamnesis_source_anamnesis_id_anamnesis_id_fk" FOREIGN KEY ("source_anamnesis_id") REFERENCES "public"."anamnesis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_feedback_by_user_id_user_id_fk" FOREIGN KEY ("feedback_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_diet_version_id_student_diet_version_id_fk" FOREIGN KEY ("diet_version_id") REFERENCES "public"."student_diet_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin" ADD CONSTRAINT "student_checkin_workout_version_id_student_workout_version_id_fk" FOREIGN KEY ("workout_version_id") REFERENCES "public"."student_workout_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin_photo" ADD CONSTRAINT "student_checkin_photo_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_checkin_photo" ADD CONSTRAINT "student_checkin_photo_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet" ADD CONSTRAINT "student_diet_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet" ADD CONSTRAINT "student_diet_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet" ADD CONSTRAINT "student_diet_source_diet_id_diet_id_fk" FOREIGN KEY ("source_diet_id") REFERENCES "public"."diet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet_version" ADD CONSTRAINT "student_diet_version_student_diet_id_student_diet_id_fk" FOREIGN KEY ("student_diet_id") REFERENCES "public"."student_diet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_diet_version" ADD CONSTRAINT "student_diet_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_checkin_id_student_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."student_checkin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout" ADD CONSTRAINT "student_workout_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout" ADD CONSTRAINT "student_workout_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout" ADD CONSTRAINT "student_workout_source_workout_id_workout_id_fk" FOREIGN KEY ("source_workout_id") REFERENCES "public"."workout"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout_version" ADD CONSTRAINT "student_workout_version_student_workout_id_student_workout_id_fk" FOREIGN KEY ("student_workout_id") REFERENCES "public"."student_workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_workout_version" ADD CONSTRAINT "student_workout_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connection" ADD CONSTRAINT "whatsapp_connection_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_conversation_id_whatsapp_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_template" ADD CONSTRAINT "whatsapp_template_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_workout_session_id_workout_session_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise_substitute" ADD CONSTRAINT "workout_exercise_substitute_workout_exercise_id_workout_exercise_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercise_substitute" ADD CONSTRAINT "workout_exercise_substitute_substitute_exercise_id_exercise_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_workout_id_workout_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_invitation_email_idx" ON "admin_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ai_generation_clinic_created_idx" ON "ai_generation" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generation_student_idx" ON "ai_generation" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "ai_generation_created_idx" ON "ai_generation" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "anamnesis_clinic_idx" ON "anamnesis" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "anamnesis_clinic_source_uq" ON "anamnesis" USING btree ("clinic_id","source_key") WHERE "anamnesis"."source_key" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_clinic_date_idx" ON "calendar_event" USING btree ("clinic_id","date");--> statement-breakpoint
CREATE INDEX "calendar_event_student_idx" ON "calendar_event" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "checkin_assessment_clinic_idx" ON "checkin_assessment" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "checkin_assessment_student_idx" ON "checkin_assessment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "checkin_evaluation_clinic_idx" ON "checkin_evaluation" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "checkin_evaluation_student_idx" ON "checkin_evaluation" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_portal_slug_uq" ON "clinic" USING btree ("portal_slug") WHERE "clinic"."portal_slug" is not null;--> statement-breakpoint
CREATE INDEX "clinic_plan_change_clinic_idx" ON "clinic_plan_change" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "coach_invitation_clinic_idx" ON "coach_invitation" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "diet_clinic_idx" ON "diet" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diet_clinic_source_uq" ON "diet" USING btree ("clinic_id","source_key") WHERE "diet"."source_key" is not null;--> statement-breakpoint
CREATE INDEX "diet_meal_diet_idx" ON "diet_meal" USING btree ("diet_id");--> statement-breakpoint
CREATE INDEX "diet_meal_item_meal_idx" ON "diet_meal_item" USING btree ("diet_meal_id");--> statement-breakpoint
CREATE INDEX "diet_meal_item_food_idx" ON "diet_meal_item" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "diet_item_sub_item_idx" ON "diet_meal_item_substitute" USING btree ("diet_meal_item_id");--> statement-breakpoint
CREATE INDEX "diet_item_sub_food_idx" ON "diet_meal_item_substitute" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "exercise_category_idx" ON "exercise" USING btree ("category");--> statement-breakpoint
CREATE INDEX "exercise_clinic_idx" ON "exercise" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "exercise_search_trgm" ON "exercise" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "exercise_sub_lookup_idx" ON "exercise_substitution" USING btree ("clinic_id","exercise_id");--> statement-breakpoint
CREATE INDEX "exercise_sub_substitute_idx" ON "exercise_substitution" USING btree ("substitute_exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_sub_base_uq" ON "exercise_substitution" USING btree ("exercise_id","substitute_exercise_id") WHERE "exercise_substitution"."clinic_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_sub_clinic_uq" ON "exercise_substitution" USING btree ("clinic_id","exercise_id","substitute_exercise_id") WHERE "exercise_substitution"."clinic_id" is not null;--> statement-breakpoint
CREATE INDEX "food_group_idx" ON "food" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "food_type_idx" ON "food" USING btree ("type");--> statement-breakpoint
CREATE INDEX "food_clinic_idx" ON "food" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "food_search_trgm" ON "food" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "food_favorite_food_idx" ON "food_favorite" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "food_measure_lookup_idx" ON "food_measure" USING btree ("clinic_id","food_id");--> statement-breakpoint
CREATE INDEX "food_measure_food_idx" ON "food_measure" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "food_nutrient_nutrient_idx" ON "food_nutrient" USING btree ("nutrient_id");--> statement-breakpoint
CREATE INDEX "food_sub_lookup_idx" ON "food_substitution" USING btree ("clinic_id","food_id");--> statement-breakpoint
CREATE INDEX "food_sub_substitute_idx" ON "food_substitution" USING btree ("substitute_food_id");--> statement-breakpoint
CREATE INDEX "invitation_clinic_student_idx" ON "invitation" USING btree ("clinic_id","student_id");--> statement-breakpoint
CREATE INDEX "invoice_clinic_idx" ON "invoice" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_uq" ON "invoice" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoice_line_item_invoice_idx" ON "invoice_line_item" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_reminder_invoice_date_uq" ON "invoice_reminder" USING btree ("invoice_id","reminder_date");--> statement-breakpoint
CREATE INDEX "notification_clinic_created_idx" ON "notification" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_read_user_idx" ON "notification_read" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_price_model_from_idx" ON "provider_price" USING btree ("provider","model","effective_from");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_clinic_idx" ON "student" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_coach_idx" ON "student" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "student_user_idx" ON "student" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_clinic_phone_uq" ON "student" USING btree ("clinic_id","phone") WHERE "student"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "student_clinic_email_uq" ON "student" USING btree ("clinic_id","email") WHERE "student"."email" is not null;--> statement-breakpoint
CREATE INDEX "student_anamnesis_clinic_idx" ON "student_anamnesis" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_checkin_clinic_idx" ON "student_checkin" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_checkin_student_date_idx" ON "student_checkin" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "student_checkin_photo_checkin_idx" ON "student_checkin_photo" USING btree ("checkin_id");--> statement-breakpoint
CREATE INDEX "student_diet_clinic_idx" ON "student_diet" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_diet_student_idx" ON "student_diet" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_diet_one_active_uq" ON "student_diet" USING btree ("student_id") WHERE "student_diet"."status" = 'active';--> statement-breakpoint
CREATE INDEX "student_diet_version_diet_idx" ON "student_diet_version" USING btree ("student_diet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_diet_version_one_draft_uq" ON "student_diet_version" USING btree ("student_diet_id") WHERE "student_diet_version"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "student_note_clinic_idx" ON "student_note" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_note_student_created_idx" ON "student_note" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "student_workout_clinic_idx" ON "student_workout" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "student_workout_student_idx" ON "student_workout" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_workout_one_active_uq" ON "student_workout" USING btree ("student_id") WHERE "student_workout"."status" = 'active';--> statement-breakpoint
CREATE INDEX "student_workout_version_workout_idx" ON "student_workout_version" USING btree ("student_workout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_workout_version_one_draft_uq" ON "student_workout_version" USING btree ("student_workout_id") WHERE "student_workout_version"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "user_clinic_idx" ON "user" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_clinic_phone_uq" ON "whatsapp_conversation" USING btree ("clinic_id","phone");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_clinic_last_idx" ON "whatsapp_conversation" USING btree ("clinic_id","last_message_at");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_student_idx" ON "whatsapp_conversation" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_clinic_conv_idx" ON "whatsapp_message" USING btree ("clinic_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_message_provider_idx" ON "whatsapp_message" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_template_base_key_uq" ON "whatsapp_template" USING btree ("key") WHERE "whatsapp_template"."clinic_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_template_clinic_key_uq" ON "whatsapp_template" USING btree ("clinic_id","key") WHERE "whatsapp_template"."clinic_id" is not null;--> statement-breakpoint
CREATE INDEX "workout_clinic_idx" ON "workout" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_clinic_source_uq" ON "workout" USING btree ("clinic_id","source_key") WHERE "workout"."source_key" is not null;--> statement-breakpoint
CREATE INDEX "workout_exercise_session_idx" ON "workout_exercise" USING btree ("workout_session_id");--> statement-breakpoint
CREATE INDEX "workout_exercise_exercise_idx" ON "workout_exercise" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_ex_sub_item_idx" ON "workout_exercise_substitute" USING btree ("workout_exercise_id");--> statement-breakpoint
CREATE INDEX "workout_ex_sub_exercise_idx" ON "workout_exercise_substitute" USING btree ("substitute_exercise_id");--> statement-breakpoint
CREATE INDEX "workout_session_workout_idx" ON "workout_session" USING btree ("workout_id");--> statement-breakpoint
INSERT INTO "plan_limit" ("plan", "max_students", "max_coaches", "whatsapp", "archive", "calendar", "ai_generations") VALUES
	('free', 5, 1, true, false, false, 1),
	('solo', 50, 1, true, false, true, 10),
	('clinica', 100, 3, true, true, true, 25),
	('enterprise', NULL, NULL, true, true, true, NULL);
