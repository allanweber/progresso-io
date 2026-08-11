import { describe, expect, it } from "vitest";

import { scaledDimensions } from "@/lib/image-compression";

/**
 * The pure sizing math behind check-in photo compression. The canvas/encode
 * path runs in the browser (exercised by the e2e submit flow); here we lock the
 * downscale rule so a huge phone photo always fits within the longest-edge cap
 * while preserving aspect ratio.
 */
describe("scaledDimensions", () => {
  it("leaves an image that already fits untouched (rounded)", () => {
    expect(scaledDimensions(1200, 800, 1600)).toEqual({
      width: 1200,
      height: 800,
    });
  });

  it("scales a landscape image down to the longest-edge cap", () => {
    expect(scaledDimensions(4000, 3000, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("scales a portrait image by its height (the longest edge)", () => {
    expect(scaledDimensions(3000, 4000, 1600)).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("never collapses a very wide image below 1px on the short edge", () => {
    const out = scaledDimensions(10000, 10, 1600);
    expect(out.width).toBe(1600);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });
});
