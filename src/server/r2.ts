import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { NextResponse } from "next/server";

import { z } from "@/lib/validation";
import { apiError } from "@/server/api";

/**
 * Server-only Cloudflare R2 helper for custom exercise images. R2 is where the
 * app serves every exercise image from (the seed catalog uploads the base
 * images at deploy — see `scripts/upload-exercise-images.mjs`); a custom
 * exercise's images go to the same bucket under a `custom/` prefix.
 *
 * Keys are stored WITHOUT the `R2_PREFIX` (exactly like the seed keys), and
 * `exerciseImageUrl()` in `src/lib/exercises.ts` resolves them to a URL — so a
 * stored `custom/<uuid>.jpg` is served from the same base domain as the rest.
 */

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image.

function r2Env() {
  // Trim every value: a stray newline/space pasted into the deploy env is a
  // classic cause of R2 "SignatureDoesNotMatch".
  const trim = (v: string | undefined) => (v ?? "").trim();
  const R2_ACCOUNT_ID = trim(process.env.R2_ACCOUNT_ID);
  const R2_ACCESS_KEY_ID = trim(process.env.R2_ACCESS_KEY_ID);
  const R2_SECRET_ACCESS_KEY = trim(process.env.R2_SECRET_ACCESS_KEY);
  const R2_BUCKET = trim(process.env.R2_BUCKET);
  const R2_PREFIX = trim(process.env.R2_PREFIX);
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return null;
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PREFIX };
}

/** Whether R2 write credentials are configured in this environment. */
export function isR2Configured(): boolean {
  return r2Env() !== null;
}

/** Sends one PutObject to R2, applying the `R2_PREFIX` to the stored key. */
async function r2PutObject(
  env: NonNullable<ReturnType<typeof r2Env>>,
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  const prefix = env.R2_PREFIX ? `${env.R2_PREFIX.replace(/\/+$/, "")}/` : "";
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // Recent aws-sdk v3 sends integrity checksum headers by default, which
    // Cloudflare R2 rejects with "SignatureDoesNotMatch". Only send them when
    // the operation actually requires it (PutObject does not).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: prefix + key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

/**
 * Uploads one image to R2 and returns its stored key (`custom/<uuid>.<ext>`,
 * without the prefix). Throws if R2 isn't configured — callers must guard with
 * {@link isR2Configured} first (the route does, answering a friendly 503).
 */
export async function putExerciseImage(
  body: Buffer,
  contentType: string,
): Promise<string> {
  const env = r2Env();
  if (!env) throw new Error("R2 not configured");
  const ext = ALLOWED_TYPES[contentType] ?? "jpg";
  const key = `custom/${randomUUID()}.${ext}`;
  await r2PutObject(env, key, body, contentType, "public, max-age=31536000, immutable");
  return key;
}

/** The metadata of the uploaded file we validate before touching R2. */
const uploadMetaSchema = z.object({
  type: z.enum(
    Object.keys(ALLOWED_TYPES) as [string, ...string[]],
    { error: "Envie uma imagem JPG, PNG ou WEBP." },
  ),
  size: z
    .number()
    .positive("Arquivo vazio.")
    .max(MAX_BYTES, "Imagem muito grande (máx. 5 MB)."),
});

/**
 * Reads a single `file` from a multipart request, validates its type/size with
 * zod, uploads it to R2 and returns the stored key. Shared by the coach and
 * admin image-upload routes (both merely differ in who is allowed to call them,
 * which the route decides before this runs). Every branch answers with a
 * ready-made PT-BR error response, so a handler stays a thin auth gate.
 */
export async function receiveExerciseImage(
  request: Request,
): Promise<{ ok: true; key: string } | { ok: false; response: NextResponse }> {
  if (!isR2Configured()) {
    return {
      ok: false,
      response: apiError("Upload de imagens indisponível neste ambiente.", 503),
    };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, response: apiError("Envio inválido.", 400) };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, response: apiError("Nenhuma imagem enviada.", 400) };
  }

  const parsed = uploadMetaSchema.safeParse({ type: file.type, size: file.size });
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(parsed.error.issues[0]?.message ?? "Imagem inválida.", 422),
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await putExerciseImage(buffer, file.type);
  return { ok: true, key };
}

/* -------------------------------------------------------------------------- */
/*  Check-in photos                                                            */
/*                                                                            */
/*  Progress photos captured in the aluno portal. Unlike exercise images       */
/*  (public catalog art), these are private and write-only for now — stored     */
/*  under a `checkins/` prefix but not served back this release. When R2 is      */
/*  configured they go to R2; when it isn't (local dev + e2e/CI) they fall back  */
/*  to a gitignored local dir, so the full submit flow works without creds.      */
/* -------------------------------------------------------------------------- */

/** Compressed uploads are small; this is a generous server-side backstop. */
export const CHECKIN_PHOTO_MAX_BYTES = 3 * 1024 * 1024; // 3 MB
/** Where the fallback writes when R2 is unconfigured (gitignored). */
const LOCAL_UPLOAD_DIR = ".uploads";

const checkinPhotoMetaSchema = z.object({
  type: z.enum(Object.keys(ALLOWED_TYPES) as [string, ...string[]], {
    error: "Envie uma imagem JPG, PNG ou WEBP.",
  }),
  size: z
    .number()
    .positive("Arquivo vazio.")
    .max(CHECKIN_PHOTO_MAX_BYTES, "Imagem muito grande após a compressão."),
});

/**
 * Validates one already-compressed photo's type + size, returning a PT-BR
 * message on failure. The client compresses before upload, so this only catches
 * a bad/oversized blob slipping through.
 */
export function validateCheckinPhoto(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const parsed = checkinPhotoMetaSchema.safeParse({
    type: file.type,
    size: file.size,
  });
  if (parsed.success) return { ok: true };
  return {
    ok: false,
    message: parsed.error.issues[0]?.message ?? "Imagem inválida.",
  };
}

/**
 * Stores one check-in photo and returns its key (`checkins/<uuid>.<ext>`,
 * without any bucket prefix). Uploads to R2 when configured; otherwise writes to
 * the gitignored `.uploads/` dir so dev + e2e work without cloud creds. The key
 * shape is identical either way.
 */
export async function putCheckinPhoto(
  body: Buffer,
  contentType: string,
): Promise<string> {
  const ext = ALLOWED_TYPES[contentType] ?? "jpg";
  const key = `checkins/${randomUUID()}.${ext}`;

  const env = r2Env();
  if (env) {
    await r2PutObject(env, key, body, contentType, "private, max-age=31536000, immutable");
    return key;
  }

  // Local-disk fallback (dev/e2e): write under .uploads/, creating the dir.
  const abs = path.join(process.cwd(), LOCAL_UPLOAD_DIR, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  return key;
}
