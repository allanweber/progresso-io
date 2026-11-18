UPDATE "clinic" SET "site_url" = NULL WHERE "site_url" IS NOT NULL AND "site_url" !~* '^https?://';
