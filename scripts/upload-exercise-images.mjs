import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const OPENGYM_COMMIT = "e4a68a94c42a3c17cbd560d66ce2e46a7048ab99";
const MEDIA_SOURCE = `https://raw.githubusercontent.com/DuarteSantos8/openGym/${OPENGYM_COMMIT}/catalogue/media`;
const CONTENT_TYPES = { webp: "image/webp", mp4: "video/mp4" };

const CATALOG = join(process.cwd(), "drizzle", "data", "exercises-catalog.ndjson.gz");
const MANIFEST_KEY = `.exercises-manifest-${OPENGYM_COMMIT}.json`;
const CONCURRENCY = 16;

function imageKeys() {
  const text = gunzipSync(readFileSync(CATALOG)).toString("utf8");
  const keys = text
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      const e = JSON.parse(l);
      return [e.image, e.video, e.femaleImage, e.femaleVideo];
    })
    .filter(Boolean);
  return [...new Set(keys)];
}

async function loadImage(key) {
  const res = await fetch(`${MEDIA_SOURCE}/${key}`);
  if (!res.ok) throw new Error(`source ${res.status} for ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

function r2Client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PREFIX = "" } = process.env;
  return {
    prefix: R2_PREFIX ? `${R2_PREFIX.replace(/\/+$/, "")}/` : "",
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

export async function uploadExerciseImages({ log = console.log } = {}) {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
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

  const { s3, prefix } = r2Client();

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
  }

  log(`Uploading ${keys.length} exercise images to R2 "${R2_BUCKET}"…`);
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
          ContentType: CONTENT_TYPES[key.split(".").pop()] ?? "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      done++;
      if (done % 200 === 0) log(`  …${done}/${keys.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

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
