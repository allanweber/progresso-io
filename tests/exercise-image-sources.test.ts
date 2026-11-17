// @vitest-environment node
import { describe, expect, it } from "vitest";

import { imageContentType, imageSourceUrl } from "../scripts/lib/exercise-image-sources.mjs";

describe("exercise image sources", () => {
  it.each([
    ["Barbell_Squat/0.jpg", "image/jpeg"],
    ["added/0001.png", "image/png"],
    ["added/0002.webp", "image/webp"],
    ["added/0003.JPEG", "image/jpeg"],
    ["added/0004.gif", "image/gif"],
    ["added/0005.bmp", "application/octet-stream"],
  ])("uploads %s as %s", (key, type) => {
    expect(imageContentType(key)).toBe(type);
  });

  it("fetches every key from free-exercise-db", () => {
    expect(imageSourceUrl("Barbell_Squat/0.jpg")).toBe(
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg",
    );
  });
});
