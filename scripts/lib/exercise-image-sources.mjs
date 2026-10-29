import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FREE_EXERCISE_DB = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const WGER_IMAGES_FILE = join(process.cwd(), "drizzle", "data", "wger-images.json");

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

let wgerUrlByKey;

export function imageSourceUrl(key) {
  wgerUrlByKey ??= new Map(
    existsSync(WGER_IMAGES_FILE)
      ? Object.values(JSON.parse(readFileSync(WGER_IMAGES_FILE, "utf8")))
          .flat()
          .map((i) => [i.key, i.url])
      : [],
  );
  return wgerUrlByKey.get(key) ?? `${FREE_EXERCISE_DB}/${key}`;
}

export function imageContentType(key) {
  return CONTENT_TYPES[key.split(".").pop().toLowerCase()] ?? "application/octet-stream";
}
