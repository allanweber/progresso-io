// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetRateLimit, hit } from "@/server/rate-limit";

/**
 * The fixed-window limiter that guards the auth/contact server actions (H-2).
 * Uses fake timers so the window-reset behaviour is deterministic.
 */
describe("rate-limit: hit()", () => {
  beforeEach(() => {
    __resetRateLimit();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `max` hits, then blocks within the window", () => {
    expect(hit("a", 3, 60_000)).toBe(true);
    expect(hit("a", 3, 60_000)).toBe(true);
    expect(hit("a", 3, 60_000)).toBe(true);
    expect(hit("a", 3, 60_000)).toBe(false); // 4th in the window is refused
    expect(hit("a", 3, 60_000)).toBe(false);
  });

  it("resets once the window elapses", () => {
    expect(hit("b", 1, 60_000)).toBe(true);
    expect(hit("b", 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(hit("b", 1, 60_000)).toBe(true); // fresh window
  });

  it("keeps separate keys independent", () => {
    expect(hit("x", 1, 60_000)).toBe(true);
    expect(hit("x", 1, 60_000)).toBe(false);
    // A different key (e.g. another IP / another e-mail) is unaffected.
    expect(hit("y", 1, 60_000)).toBe(true);
  });
});
