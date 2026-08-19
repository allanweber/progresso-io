-- The OpenRouter switch: model settings as data, plus routing and reported cost
-- on ai_generation.
--
-- ai_settings is a SINGLE row holding which model drafts programs. That is the
-- one decision about this feature that gets revisited — prices move, slugs get
-- retired, and the whole point of an aggregator is that trying another model
-- should be cheap. As an env var that is a deploy; as a row it is a form at
-- /admin/ai. The `singleton` UNIQUE column is what stops a second row existing:
-- two rows would leave a reader choosing, and the choice would be arbitrary.
-- No row is inserted here — with none, the coded defaults apply, so a fresh
-- install generates without anyone seeding anything.
--
-- The generator now reaches vendors through an aggregator, which buys cheap
-- model swapping and costs two kinds of ambiguity the new columns close:
--
--  * WHO served the call. The same model slug is offered by several hosts at
--    different prices, and a fallback list can promote a different model
--    entirely when the primary is rate-limited or retired. upstream_provider
--    records the host; `model` is overwritten on settle with the slug that
--    actually answered, so token counts are never priced against a model that
--    did not produce them.
--  * WHAT it cost. reported_cost_micro_usd is what the provider says it
--    charged. This does NOT reinstate the frozen price dropped in 0032: that
--    number came from config and could only ever restate an assumption, while
--    this one is returned by the call, in the same class of fact as the token
--    counts beside it. provider_price is unchanged and still prices every row —
--    it covers vendors that report nothing, it is what makes a forecast
--    possible, and it stays correctable after the fact.
--
-- Every new ai_generation column is nullable with no backfill: rows written
-- before the switch genuinely have no answer for any of them, and NULL says
-- exactly that.
--
-- The index serves the cross-tenant admin rollups, which filter on created_at
-- alone and so never touch ai_generation_clinic_created_idx.

CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"model" text NOT NULL,
	"fallback_models" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_singleton_unique" UNIQUE("singleton")
);
--> statement-breakpoint
ALTER TABLE "ai_generation" ADD COLUMN "upstream_provider" text;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD COLUMN "reported_cost_micro_usd" integer;--> statement-breakpoint
CREATE INDEX "ai_generation_created_idx" ON "ai_generation" USING btree ("created_at");