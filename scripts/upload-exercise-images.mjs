// Uploads the exercise images to the Cloudflare R2 bucket the app serves them
// from. R2 is S3-compatible, so this uses the AWS SDK's S3 client.
//
// This runs AUTOMATICALLY on deploy — scripts/migrate.mjs calls
// uploadExerciseImages() right after seeding — so no manual step is needed.
//
// Image source: the images are NOT committed to the repo (100 MB of binaries).
// Instead the keys come from the seed catalog, and each image is read from a
// local folder if present (drizzle/data/exercises-images/, populated by
// `npm run db:fetch-exercise-images` for a fast local upload) or streamed from
// the free-exercise-db CDN otherwise (the deploy path — nothing to clone).
//
// Required env (see .env.example): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET. Optional: R2_PREFIX. When any is missing the
// upload is skipped (not an error), so envs without R2 deploy fine.
//
// Idempotent: after a full upload it writes a small manifest object; subsequent
// runs see the manifest (a single HEAD) and skip. Delete it to force a re-upload.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const CATALOG = join(process.cwd(), "drizzle", "data", "exercises-catalog.ndjson.gz");
const IMAGES_DIR = join(process.cwd(), "drizzle", "data", "exercises-images");
const CDN = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const MANIFEST_KEY = ".exercises-manifest.json";
const CONCURRENCY = 16;

/** Every image key ("<code>/<n>.jpg") referenced by the seed catalog. */
function imageKeys() {
  const text = gunzipSync(readFileSync(CATALOG)).toString("utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => JSON.parse(l).images ?? []);
}

/** Loads one image as a Buffer — from the local folder if present, else the CDN. */
async function loadImage(key) {
  const local = join(IMAGES_DIR, key);
  if (existsSync(local)) return readFileSync(local);
  const res = await fetch(`${CDN}/${key}`);
  if (!res.ok) throw new Error(`CDN ${res.status} for ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Uploads every exercise image to R2. Returns a small result describing what
 * happened. Never throws for a missing configuration — it just skips — so the
 * deploy seed can call it unconditionally.
 */
export async function uploadExerciseImages({ log = console.log } = {}) {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX = "",
  } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    log("• R2 not configured — skipping exercise image upload.");
    return { skipped: true, reason: "no-config" };
  }

  let keys;
  try {
    keys = imageKeys();
  } catch {
    log(`• No catalog at ${CATALOG} — skipping image upload.`);
    return { skipped: true, reason: "no-catalog" };
  }
  if (keys.length === 0) return { skipped: true, reason: "no-images" };

  const prefix = R2_PREFIX ? `${R2_PREFIX.replace(/\/+$/, "")}/` : "";
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    // R2 rejects the aws-sdk v3 default integrity checksums with
    // "SignatureDoesNotMatch"; only send them when the operation requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  // A prior full upload leaves a manifest — skip when it already covers these
  // images, so re-deploys don't re-push thousands of unchanged objects.
  const manifestKey = `${prefix}${MANIFEST_KEY}`;
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: manifestKey }),
    );
    const uploaded = Number(head.Metadata?.count ?? "0");
    if (uploaded >= keys.length) {
      log(`✓ Exercise images already uploaded (${uploaded}) — skipping.`);
      return { skipped: true, reason: "manifest", uploaded };
    }
  } catch {
    // No manifest (or not readable) — do a full upload below.
  }

  const source = existsSync(IMAGES_DIR) ? "local folder" : "source CDN";
  log(`Uploading ${keys.length} exercise images to R2 "${R2_BUCKET}" (from ${source})…`);
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < keys.length) {
      const key = keys[cursor++];
      const body = await loadImage(key);
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: prefix + key,
          Body: body,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      done++;
      if (done % 200 === 0) log(`  …${done}/${keys.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Write the manifest LAST, so a skip only ever happens after a full upload.
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: manifestKey,
      Body: JSON.stringify({ count: keys.length }),
      ContentType: "application/json",
      Metadata: { count: String(keys.length) },
    }),
  );

  log(`✓ Uploaded ${done} exercise images.`);
  return { skipped: false, uploaded: done };
}

// Allow running the uploader directly: `npm run db:upload-exercise-images`.
if (import.meta.url === `file://${process.argv[1]}`) {
  await import("dotenv/config");
  const result = await uploadExerciseImages();
  if (result.skipped && result.reason === "no-config") process.exitCode = 1;
}
