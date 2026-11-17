const FREE_EXERCISE_DB = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function imageSourceUrl(key) {
  return `${FREE_EXERCISE_DB}/${key}`;
}

export function imageContentType(key) {
  return CONTENT_TYPES[key.split(".").pop().toLowerCase()] ?? "application/octet-stream";
}
