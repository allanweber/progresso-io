import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DATA = join(process.cwd(), "drizzle", "data");
export const EXERCISEDB_FILE = join(DATA, "exercisedb-src", "exercisedb.json");
export const EXERCISEDB_PTBR_FILE = join(DATA, "exercisedb-src", "exercisedb-ptbr.json");
export const FREE_DB_FILE = join(DATA, "exercises-src", "free-exercise-db.json");
export const PTBR_FILE = join(DATA, "exercises-src", "exercicios-ptbr-full.json");
export const MATCHES_FILE = join(DATA, "opengym-matches.json");

export const CATEGORIES = [
  "strength",
  "stretching",
  "plyometrics",
  "strongman",
  "powerlifting",
  "cardio",
  "olympic_weightlifting",
];
export const LEVELS = ["beginner", "intermediate", "expert"];
export const FORCES = ["pull", "push", "static"];
export const MECHANICS = ["compound", "isolation"];
export const EQUIPMENT = [
  "body_only",
  "machine",
  "other",
  "foam_roll",
  "kettlebells",
  "dumbbell",
  "cable",
  "barbell",
  "bands",
  "medicine_ball",
  "exercise_ball",
  "e_z_curl_bar",
];
export const MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower_back",
  "middle_back",
  "neck",
  "quadriceps",
  "shoulders",
  "triceps",
  "traps",
];

export const EXERCISEDB_EQUIPMENT = {
  "body weight": "body_only",
  assisted: "machine",
  dumbbell: "dumbbell",
  cable: "cable",
  barbell: "barbell",
  "olympic barbell": "barbell",
  "trap bar": "barbell",
  "ez barbell": "e_z_curl_bar",
  "leverage machine": "machine",
  "smith machine": "machine",
  "sled machine": "machine",
  "elliptical machine": "machine",
  "stepmill machine": "machine",
  "skierg machine": "machine",
  "stationary bike": "machine",
  "upper body ergometer": "machine",
  band: "bands",
  "resistance band": "bands",
  kettlebell: "kettlebells",
  "medicine ball": "medicine_ball",
  "stability ball": "exercise_ball",
  "bosu ball": "exercise_ball",
  roller: "foam_roll",
  "wheel roller": "other",
  weighted: "other",
  rope: "other",
  hammer: "other",
  tire: "other",
};

export const EXERCISEDB_TARGET = {
  abs: "abdominals",
  pectorals: "chest",
  biceps: "biceps",
  glutes: "glutes",
  delts: "shoulders",
  triceps: "triceps",
  "upper back": "middle_back",
  lats: "lats",
  calves: "calves",
  quads: "quadriceps",
  forearms: "forearms",
  hamstrings: "hamstrings",
  spine: "lower_back",
  traps: "traps",
  adductors: "adductors",
  abductors: "abductors",
  "levator scapulae": "neck",
};

export const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
