// Uploads the local exercise images
// (drizzle/data/exercises-images/<code>/<n>.jpg, populated by
// scripts/fetch-exercise-images.mjs) to the Cloudflare R2 bucket the app serves
// images from. R2 is S3-compatible, so this uses the AWS SDK's S3 client.
//
// This runs AUTOMATICALLY on deploy — scripts/migrate.mjs calls
// uploadExerciseImages() right after seeding — so no manual step is needed. It
// can also be run on its own: `npm run db:upload-exercise-images`.
//
// Required env (see .env.example): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET. Optional: R2_PREFIX (key prefix in the
// bucket). When any is missing the upload is skipped (not an error), so envs
// without R2 configured — and local dev — deploy fine (the app falls back to the
// source CDN for images).
//
// Idempotent: after a full upload it writes a small manifest object; subsequent
// runs see the manifest (a single HEAD) and skip. Delete it to force a re-upload.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const IMAGES_DIR = join(process.cwd(), "drizzle", "data", "exercises-images");
const MANIFEST_KEY = ".exercises-manifest.json";
const CONCURRENCY = 16;

/** Recursively lists every file under `dir` as an absolute path. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Uploads every local exercise image to R2. Returns a small result describing
 * what happened. Never throws for a missing configuration — it just skips —
 * so the deploy seed can call it unconditionally.
 */
export async function uploadExerciseImages({ log = console.log } = {}) {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX = "",
  } = process.env;

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    log("• R2 not configured — skipping exercise image upload.");
    return { skipped: true, reason: "no-config" };
  }

  let files;
  try {
    files = walk(IMAGES_DIR);
  } catch {
    log(`• No local images at ${IMAGES_DIR} — skipping image upload.`);
    return { skipped: true, reason: "no-images" };
  }
  if (files.length === 0) return { skipped: true, reason: "no-images" };

  const prefix = R2_PREFIX ? `${R2_PREFIX.replace(/\/+$/, "")}/` : "";
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // A prior full upload leaves a manifest — skip when it already covers these
  // files, so re-deploys don't re-push thousands of unchanged objects.
  const manifestKey = `${prefix}${MANIFEST_KEY}`;
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: manifestKey }),
    );
    const uploaded = Number(head.Metadata?.count ?? "0");
    if (uploaded >= files.length) {
      log(`✓ Exercise images already uploaded (${uploaded}) — skipping.`);
      return { skipped: true, reason: "manifest", uploaded };
    }
  } catch {
    // No manifest (or not readable) — do a full upload below.
  }

  log(`Uploading ${files.length} exercise images to R2 "${R2_BUCKET}"…`);
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      const key = prefix + relative(IMAGES_DIR, file).split("\\").join("/");
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: readFileSync(file),
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      done++;
      if (done % 200 === 0) log(`  …${done}/${files.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Write the manifest LAST, so a skip only ever happens after a full upload.
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: manifestKey,
      Body: JSON.stringify({ count: files.length }),
      ContentType: "application/json",
      Metadata: { count: String(files.length) },
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
