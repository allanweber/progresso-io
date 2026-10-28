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

const matches = (
  JSON.parse(readFileSync(data("opengym-matches.json"), "utf8")) as {
    matches: { openGymId: string; code: string | null }[];
  }
).matches;

const substitutions = (
  JSON.parse(readFileSync(data("exercise-substitutions.json"), "utf8")) as {
    substitutions: { exercise: string; substitutes: string[] }[];
  }
).substitutions;

const exercisedbRows = catalog.filter((e) => e.source === "exercisedb");

describe("openGym match file", () => {
  it("covers every incoming openGym id exactly once", () => {
    const ids = matches.map((m) => m.openGymId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(incomingIds);
  });

  it("points every match at an existing free-exercise-db code, each claimed once", () => {
    const codes = matches.flatMap((m) => (m.code ? [m.code] : []));
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(byCode.get(code)?.source, code).toBe("free-exercise-db");
    }
  });
});

describe("seed catalog", () => {
  it("has unique codes, openGym ids and new-exercise names", () => {
    expect(byCode.size).toBe(catalog.length);
    const names = catalog.map((e) => e.name.toLowerCase());
    for (const e of exercisedbRows) {
      expect(names.filter((n) => n === e.name.toLowerCase()), e.code).toHaveLength(1);
    }
    const ids = catalog.flatMap((e) => (e.openGymId ? [e.openGymId] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => incomingIds.has(id))).toBe(true);
  });

  it("carries every incoming openGym id, matched or new", () => {
    const ids = new Set(catalog.flatMap((e) => (e.openGymId ? [e.openGymId] : [])));
    expect(ids).toEqual(incomingIds);
  });

  it("gives every matched exercise the openGym id of its match", () => {
    for (const m of matches) {
      if (m.code) expect(byCode.get(m.code)?.openGymId, m.code).toBe(m.openGymId);
    }
  });

  it.each(exercisedbRows.map((e) => [e.code, e] as const))(
    "%s is a complete, media-free PT-BR exercise",
    (_code, e) => {
      expect(e.name.trim()).not.toBe("");
      expect(e.instructions.length).toBeGreaterThan(0);
      expect(e.instructions.every((s) => s.trim() !== "")).toBe(true);
      expect(e.images).toEqual([]);
      expect(EXERCISE_CATEGORIES).toContain(e.category);
      expect(EXERCISE_LEVELS).toContain(e.level);
      if (e.force !== null) expect(EXERCISE_FORCES).toContain(e.force);
      if (e.mechanic !== null) expect(EXERCISE_MECHANICS).toContain(e.mechanic);
      if (e.equipment !== null) expect(EXERCISE_EQUIPMENT).toContain(e.equipment);
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
        expect(MUSCLES).toContain(m);
      }
    },
  );
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
