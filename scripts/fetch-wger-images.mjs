import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://wger.de/api/v2";
const DATA = join(process.cwd(), "drizzle", "data");
const MATCHES = join(DATA, "wger-matches.json");
const OUT = join(DATA, "wger-images.json");
const MAX_IMAGES = 2;

async function getJson(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

const matches = JSON.parse(readFileSync(MATCHES, "utf8"));
const [{ results: images }, { results: licenses }] = await Promise.all([
  getJson("exerciseimage/?limit=1000&format=json"),
  getJson("license/?limit=100&format=json"),
]);
const licenseById = new Map(licenses.map((l) => [l.id, l]));

const byCode = {};
for (const m of matches) {
  const own = images
    .filter((i) => i.exercise === m.wgerExerciseId)
    .sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.id - b.id)
    .slice(0, MAX_IMAGES);
  if (own.length === 0) throw new Error(`wger exercise ${m.wgerExerciseId} has no images`);
  const code = `exercisedb-${m.openGymId}`;
  byCode[code] = own.map((i, n) => {
    const license = licenseById.get(i.license);
    if (!license) throw new Error(`unknown wger license ${i.license}`);
    const ext = i.image.split(".").pop().toLowerCase();
    return {
      key: `${code}/${n}.${ext}`,
      url: i.image,
      credit: {
        author: i.license_author || "wger.de",
        license: license.short_name,
        licenseUrl: license.url,
        sourceUrl: `https://wger.de/exercise/${m.wgerExerciseId}/view/`,
        aiGenerated: i.is_ai_generated,
      },
    };
  });
}

writeFileSync(OUT, JSON.stringify(byCode, null, 1) + "\n");
const count = Object.values(byCode).flat().length;
console.log(`✓ ${count} wger images for ${matches.length} exercises written to ${OUT}`);
