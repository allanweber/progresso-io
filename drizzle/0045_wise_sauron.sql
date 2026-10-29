CREATE TABLE "exercise_maintenance_op" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"applied_at" timestamp DEFAULT now() NOT NULL
);
