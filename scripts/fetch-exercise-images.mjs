// Dev-time fetcher: downloads every exercise image referenced by the seed
// artifact (drizzle/data/exercises-catalog.ndjson.gz) into a local, versioned
// folder next to the seed (drizzle/data/exercises-images/<id>/<n>.jpg).
//
// Source: yuhonas/free-exercise-db (Unlicense / public domain). Keeping the
// images in the repo means the seed is self-contained — no external CDN is hit
// at deploy time — and scripts/upload-exercise-images.mjs can push this same
// folder to the Cloudflare R2 bucket the app serves from.
//
// Idempotent: an image already on disk is skipped, so re-runs only fetch what's
// missing. Run: npm run db:fetch-exercise-images
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

const CATALOG = join(process.cwd(), "drizzle", "data", "exercises-catalog.ndjson.gz");
const OUT_DIR = join(process.cwd(), "drizzle", "data", "exercises-images");
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const CONCURRENCY = 16;

const text = gunzipSync(readFileSync(CATALOG)).toString("utf8");
const keys = text
  .split("\n")
  .filter(Boolean)
  .flatMap((l) => JSON.parse(l).images ?? []);

console.log(`Exercise images: ${keys.length} referenced.`);

let fetched = 0;
let skipped = 0;
let failed = 0;

/** Downloads one image key ("<id>/<n>.jpg") unless it already exists locally. */
async function fetchOne(key) {
  const dest = join(OUT_DIR, key);
  if (existsSync(dest)) {
    skipped++;
    return;
  }
  const res = await fetch(`${BASE}/${key}`);
  if (!res.ok) {
    failed++;
    console.warn(`  ✗ ${key} → HTTP ${res.status}`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  fetched++;
  if (fetched % 200 === 0) console.log(`  …${fetched} downloaded`);
}

// Simple bounded-concurrency pool over the key list.
let cursor = 0;
async function worker() {
  while (cursor < keys.length) {
    const key = keys[cursor++];
    await fetchOne(key);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(
  `✓ Done: ${fetched} downloaded · ${skipped} already present · ${failed} failed.`,
);
if (failed > 0) process.exitCode = 1;
