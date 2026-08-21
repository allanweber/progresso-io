// Shrinks the landing page's product screenshots after the e2e tour captures
// them (see e2e/portfolio.spec.ts → "landing assets").
//
// They are shot at deviceScaleFactor 2 so they stay sharp on a retina display,
// which makes the raw files several megabytes. Next's image optimizer would
// serve a small version regardless, but the repository should not carry the
// full-size originals for the sake of it.
//
// Idempotent: re-running on already-optimized files is a no-op in effect, since
// the resize only ever shrinks.
import { readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const DIR = "public/landing";
/** Twice the largest size any of these is displayed at, so 2x screens are served real pixels. */
const MAX_WIDTH = 1600;

const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
if (files.length === 0) {
  console.info("→ Nothing in public/landing — run the e2e portfolio project first.");
  process.exit(0);
}

for (const file of files) {
  const path = join(DIR, file);
  const before = (await stat(path)).size;
  const tmp = `${path}.tmp`;
  await sharp(path)
    // `withoutEnlargement` so the phone shot (780px wide) is left alone.
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(tmp);
  await rename(tmp, path);
  const after = (await stat(path)).size;
  const kb = (n) => `${Math.round(n / 1024)} kB`;
  console.info(`✓ ${file}: ${kb(before)} → ${kb(after)}`);
}
