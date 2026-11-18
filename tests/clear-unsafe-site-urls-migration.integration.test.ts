// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { createTestDb, type TestDb } from "./pglite";

const migrationSql = readFileSync(
  join(process.cwd(), "drizzle", "0001_clear-unsafe-site-urls.sql"),
  "utf8",
);

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values({
    id: "owner-site-url",
    name: "Owner",
    email: "owner-site-url@example.com",
  });
});

const cases: Array<[string | null, string | null]> = [
  ["javascript:alert(1)", null],
  ["JavaScript:alert(1)", null],
  ["data:text/html,<script>alert(1)</script>", null],
  ["vbscript:msgbox(1)", null],
  ["ftp://studioforja.com.br", null],
  ["https://studioforja.com.br", "https://studioforja.com.br"],
  ["http://studioforja.com.br", "http://studioforja.com.br"],
  ["HTTPS://STUDIOFORJA.COM.BR", "HTTPS://STUDIOFORJA.COM.BR"],
  [null, null],
];

describe("0001_clear-unsafe-site-urls migration", () => {
  it("clears every site URL that is not http(s) and keeps the rest", async () => {
    const rows = await db
      .insert(schema.clinic)
      .values(
        cases.map(([siteUrl], i) => ({
          name: `Clinic ${i}`,
          ownerUserId: "owner-site-url",
          siteUrl,
        })),
      )
      .returning({ id: schema.clinic.id });

    await db.execute(sql.raw(migrationSql));

    const after = await db
      .select({ id: schema.clinic.id, siteUrl: schema.clinic.siteUrl })
      .from(schema.clinic);
    const byId = new Map(after.map((r) => [r.id, r.siteUrl]));

    expect(rows.map((r) => byId.get(r.id))).toEqual(cases.map(([, want]) => want));
  });
});
