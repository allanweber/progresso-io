// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  BODY_MAP_MUSCLES,
  EXERCISE_BODY_PARTS,
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_MACHINE_KINDS,
  EXERCISE_NEEDS,
  EXERCISE_SECONDARY_MUSCLES,
  EXERCISE_TARGETS,
  isMachineEquipment,
  type ExerciseEquipment,
} from "@/lib/exercises";

type CatalogRow = {
  code: string;
  name: string;
  nameEn: string;
  description: string | null;
  descriptionEn: string | null;
  bodyPart: string;
  category: string;
  equipment: string;
  machineKind: string | null;
  target: string;
  secondaryMuscles: string[];
  mapPrimary: string[];
  mapSecondary: string[];
  muscleWeights: Record<string, number>;
  needs: string[];
  hold: boolean;
  track: string | null;
  instructions: string[];
  instructionsEn: string[];
  image: string;
  video: string;
  femaleImage: string | null;
  femaleVideo: string | null;
};

const data = (p: string) => join(process.cwd(), "drizzle", "data", p);

const catalog = gunzipSync(readFileSync(data("exercises-catalog.ndjson.gz")))
  .toString("utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as CatalogRow);
const byCode = new Map(catalog.map((e) => [e.code, e]));

const substitutions = (
  JSON.parse(readFileSync(data("exercise-substitutions.json"), "utf8")) as {
    substitutions: { exercise: string; substitutes: string[] }[];
  }
).substitutions;

describe("seed catalog", () => {
  it("has the full openGym library with unique codes", () => {
    expect(catalog.length).toBe(5632);
    expect(byCode.size).toBe(catalog.length);
    expect(catalog.every((e) => /^\d{4,5}$/.test(e.code))).toBe(true);
  });

  it("has pt-BR text for every exercise", () => {
    for (const e of catalog) {
      expect(e.name.trim(), e.code).not.toBe("");
      expect(e.description?.trim(), e.code).toBeTruthy();
      expect(e.instructions.length, e.code).toBeGreaterThan(0);
      expect(e.instructions.join(" "), e.code).not.toContain("—");
    }
  });

  it("uses only the openGym vocabulary", () => {
    for (const e of catalog) {
      expect(EXERCISE_BODY_PARTS, e.code).toContain(e.bodyPart);
      expect(EXERCISE_CATEGORIES, e.code).toContain(e.category);
      expect(EXERCISE_EQUIPMENT, e.code).toContain(e.equipment);
      expect(EXERCISE_TARGETS, e.code).toContain(e.target);
      for (const m of e.secondaryMuscles) expect(EXERCISE_SECONDARY_MUSCLES, e.code).toContain(m);
      for (const m of [...e.mapPrimary, ...e.mapSecondary]) {
        expect(BODY_MAP_MUSCLES, e.code).toContain(m);
      }
      for (const n of e.needs) expect(EXERCISE_NEEDS, e.code).toContain(n);
      if (isMachineEquipment(e.equipment as ExerciseEquipment)) {
        expect(EXERCISE_MACHINE_KINDS, e.code).toContain(e.machineKind);
      } else {
        expect(e.machineKind, e.code).toBeNull();
      }
    }
  });

  it("gives a positive weight to every muscle on the body map", () => {
    for (const e of catalog) {
      for (const m of [...e.mapPrimary, ...e.mapSecondary]) {
        expect(e.muscleWeights[m], `${e.code} ${m}`).toBeGreaterThan(0);
      }
    }
  });

  it("points every exercise at its own still and clip", () => {
    for (const e of catalog) {
      expect(e.image).toBe(`still/${e.code}.webp`);
      expect(e.video).toBe(`clip/${e.code}.mp4`);
      if (e.femaleImage) expect(e.femaleImage).toMatch(/^still\/\d{4,5}\.webp$/);
      expect(Boolean(e.femaleImage)).toBe(Boolean(e.femaleVideo));
    }
    expect(catalog.filter((e) => e.femaleImage).length).toBeGreaterThan(900);
  });
});

describe("exercise substitutions", () => {
  it("only link known codes, never to themselves, at most four each", () => {
    for (const rule of substitutions) {
      expect(byCode.has(rule.exercise), rule.exercise).toBe(true);
      expect(rule.substitutes.length).toBeLessThanOrEqual(4);
      expect(new Set(rule.substitutes).size).toBe(rule.substitutes.length);
      for (const sub of rule.substitutes) {
        expect(byCode.has(sub), sub).toBe(true);
        expect(sub).not.toBe(rule.exercise);
      }
    }
  });

  it("swaps an exercise for others that train the same target muscle", () => {
    for (const rule of substitutions) {
      const target = byCode.get(rule.exercise)!.target;
      for (const sub of rule.substitutes) expect(byCode.get(sub)!.target).toBe(target);
    }
  });

  it("keeps the reviewed bench press family together", () => {
    const bench = substitutions.find((r) => r.exercise === "0025")!;
    const names = bench.substitutes.map((c) => byCode.get(c)!.nameEn.toLowerCase());
    expect(names.every((n) => n.includes("press"))).toBe(true);
  });
});
