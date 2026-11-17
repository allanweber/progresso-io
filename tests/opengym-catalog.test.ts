// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_FORCES,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  MUSCLES,
} from "@/db/schema";

type CatalogRow = {
  code: string;
  name: string;
  instructions: string[];
  category: string;
  level: string;
  force: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  images: string[];
  imageCredits: Record<string, { author: string; license: string; licenseUrl: string; sourceUrl: string }>;
  openGymId?: string | null;
  source: string;
};

const data = (p: string) => join(process.cwd(), "drizzle", "data", p);

const catalog = gunzipSync(readFileSync(data("exercises-catalog.ndjson.gz")))
  .toString("utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as CatalogRow);
const byCode = new Map(catalog.map((e) => [e.code, e]));

const incoming = JSON.parse(
  readFileSync(data("exercisedb-src/exercisedb.json"), "utf8"),
) as { id: string }[];
const incomingIds = new Set(incoming.map((e) => e.id));

const substitutions = (
  JSON.parse(readFileSync(data("exercise-substitutions.json"), "utf8")) as {
    substitutions: { exercise: string; substitutes: string[] }[];
  }
).substitutions;

describe("seed catalog", () => {
  it("has unique codes", () => {
    expect(byCode.size).toBe(catalog.length);
  });

  it("links every exercise to its own incoming openGym id", () => {
    const ids = catalog.map((e) => e.openGymId);
    expect(ids.every((id) => typeof id === "string" && /^\d{4}$/.test(id) && incomingIds.has(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(catalog.map((e) => [e.code, e] as const))("%s is a complete exercise", (_code, e) => {
    expect(e.name.trim()).not.toBe("");
    expect(EXERCISE_CATEGORIES).toContain(e.category);
    expect(EXERCISE_LEVELS).toContain(e.level);
    if (e.force !== null) expect(EXERCISE_FORCES).toContain(e.force);
    if (e.mechanic !== null) expect(EXERCISE_MECHANICS).toContain(e.mechanic);
    if (e.equipment !== null) expect(EXERCISE_EQUIPMENT).toContain(e.equipment);
    expect(e.primaryMuscles.length).toBeGreaterThan(0);
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
      expect(MUSCLES).toContain(m);
    }
    for (const key of e.images) {
      if (e.source === "free-exercise-db") expect(e.imageCredits[key]).toBeUndefined();
      else expect(e.imageCredits[key]?.author.trim(), key).toBeTruthy();
    }
  });
});

describe("exercise substitutions", () => {
  it("only link known codes, never to themselves", () => {
    for (const rule of substitutions) {
      expect(byCode.has(rule.exercise), rule.exercise).toBe(true);
      for (const sub of rule.substitutes) {
        expect(byCode.has(sub), sub).toBe(true);
        expect(sub).not.toBe(rule.exercise);
      }
    }
  });
});
