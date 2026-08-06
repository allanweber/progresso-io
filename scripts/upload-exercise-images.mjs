// Ops script: uploads the local exercise images
// (drizzle/data/exercises-images/<code>/<n>.jpg, populated by
// scripts/fetch-exercise-images.mjs) to the Cloudflare R2 bucket the app serves
// images from. R2 is S3-compatible, so this uses the AWS SDK's S3 client.
//
// The SDK is imported dynamically and is NOT a project dependency (it's only
// needed for this one-off upload, never at runtime). Install it first:
//   npm i -D @aws-sdk/client-s3
//
// Required env (see .env.example): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET. Optional: R2_PREFIX (key prefix in the
// bucket). After uploading, set NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL to the
// bucket's public/custom-domain URL (plus the same prefix, if any).
//
// Idempotent by nature: re-uploading overwrites identical objects. Run:
//   npm run db:upload-exercise-images
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import "dotenv/config";

const IMAGES_DIR = join(process.cwd(), "drizzle", "data", "exercises-images");
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PREFIX = "",
} = process.env;

const missing = [
  ["R2_ACCOUNT_ID", R2_ACCOUNT_ID],
  ["R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID],
  ["R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY],
  ["R2_BUCKET", R2_BUCKET],
].filter(([, v]) => !v);
if (missing.length) {
  console.error(
    `Missing env: ${missing.map(([k]) => k).join(", ")}. See .env.example.`,
  );
  process.exit(1);
}

let S3Client, PutObjectCommand;
try {
  ({ S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3"));
} catch {
  console.error(
    "@aws-sdk/client-s3 is not installed. Run: npm i -D @aws-sdk/client-s3",
  );
  process.exit(1);
}

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

const files = walk(IMAGES_DIR);
console.log(`Uploading ${files.length} images to R2 bucket "${R2_BUCKET}"…`);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const prefix = R2_PREFIX ? `${R2_PREFIX.replace(/\/+$/, "")}/` : "";
let done = 0;
const CONCURRENCY = 16;
let cursor = 0;

async function worker() {
  while (cursor < files.length) {
    const file = files[cursor++];
    // Key is the path relative to the images dir ("<code>/0.jpg"), POSIX slashes.
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
    if (done % 200 === 0) console.log(`  …${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`✓ Uploaded ${done} images.`);
