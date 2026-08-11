/**
 * Client-side image compression for check-in photos. The student may pick a
 * large original (no size cap) — the browser downscales the longest edge and
 * re-encodes it to WebP (JPEG fallback) so only a small blob is uploaded. Uses
 * `createImageBitmap` with EXIF-orientation baked in, then a canvas.
 *
 * The pure {@link scaledDimensions} is unit-tested; the canvas path runs in the
 * browser and is exercised end-to-end by the e2e submit flow.
 */

export type CompressOptions = {
  /** Longest-edge cap in px (aspect ratio preserved). Default 1600. */
  maxEdge?: number;
  /** Encoder quality 0–1. Default 0.72. */
  quality?: number;
  /** Preferred output type. Default "image/webp" (falls back to JPEG). */
  type?: "image/webp" | "image/jpeg";
};

/**
 * The target canvas size: the source size when it already fits within
 * `maxEdge`, otherwise scaled down proportionally (never below 1px).
 */
export function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), type, quality),
  );
}

/**
 * Compresses `file` to a small Blob. Returns the original file unchanged if the
 * browser can't decode/encode it (defensive — the server still validates).
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<Blob> {
  const { maxEdge = 1600, quality = 0.72, type = "image/webp" } = opts;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const { width, height } = scaledDimensions(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Prefer WebP; some browsers silently emit PNG when WebP is unsupported, so
  // fall back to JPEG when the requested type didn't come back.
  const preferred = await canvasToBlob(canvas, type, quality);
  if (preferred && preferred.type === type) return preferred;
  const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  return jpeg ?? preferred ?? file;
}
