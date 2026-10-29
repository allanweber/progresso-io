// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { imageContentType, imageSourceUrl } from "../scripts/lib/exercise-image-sources.mjs";

const wger = JSON.parse(
  readFileSync(join(process.cwd(), "drizzle", "data", "wger-images.json"), "utf8"),
) as Record<string, { key: string; url: string }[]>;

describe("exercise image sources", () => {
  it.each([
    ["Barbell_Squat/0.jpg", "image/jpeg"],
    ["exercisedb-0039/0.png", "image/png"],
    ["exercisedb-0001/1.webp", "image/webp"],
    ["exercisedb-0002/0.JPEG", "image/jpeg"],
    ["exercisedb-0003/0.gif", "image/gif"],
    ["exercisedb-0004/0.bmp", "application/octet-stream"],
  ])("uploads %s as %s", (key, type) => {
    expect(imageContentType(key)).toBe(type);
  });

  it("fetches wger keys from wger and every other key from free-exercise-db", () => {
    const [first] = Object.values(wger).flat();
    expect(imageSourceUrl(first.key)).toBe(first.url);
    expect(imageSourceUrl("Barbell_Squat/0.jpg")).toBe(
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg",
    );
  });
});
