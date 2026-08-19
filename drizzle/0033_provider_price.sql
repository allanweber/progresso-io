-- LLM prices, effective-dated. Platform reference data (no clinic_id), managed
-- by admins at /admin/ai.
--
-- Prices are per MILLION tokens, in millionths of a USD: $0.03/M is 30000.
-- Integers on purpose — a month of summing floats drifts, and money that drifts
-- is money nobody trusts.
--
-- Rows are appended, never overwritten. A generation is priced by the row with
-- the greatest effective_from at or before the moment it ran, so a vendor price
-- change adds a row and every historical figure stays correct. Seeded empty:
-- with no rows, cost simply reads as unknown, which is what it honestly is
-- until someone enters a price off a vendor page they can open.

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
CREATE UNIQUE INDEX "provider_price_model_from_idx" ON "provider_price" USING btree ("provider","model","effective_from");