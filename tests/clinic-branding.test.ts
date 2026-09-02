import { describe, expect, it } from "vitest";

import {
  accentThemeVars,
  canUseBrandedPortal,
  clinicSettingsSchema,
  instagramUrl,
  portalPathPrefix,
  whatsappUrl,
} from "@/lib/clinic-settings";

/**
 * Unit tests for the branded-portal validation + helpers (no DB). Covers the
 * reserved-slug blocklist, accent/URL formats, and the public link normalizers.
 */

function base(over: Record<string, unknown> = {}) {
  return {
    name: "Studio Forja",
    portalSubdomain: "",
    headline: "",
    description: "",
    whatsapp: "",
    instagram: "",
    siteUrl: "",
    accentColor: "",
    feedbackFrequency: "semanal",
    feedbackPreferredDay: "monday",
    feedbackWhatsappReminder: true,
    ...over,
  };
}

describe("portal slug validation", () => {
  it("accepts a valid slug", () => {
    const r = clinicSettingsSchema.safeParse(base({ portalSubdomain: "studio-forja" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.portalSubdomain).toBe("studio-forja");
  });

  it("lowercases and trims", () => {
    const r = clinicSettingsSchema.safeParse(base({ portalSubdomain: "  Studio-Forja  " }));
    expect(r.success && r.data.portalSubdomain).toBe("studio-forja");
  });

  it("treats empty as null", () => {
    const r = clinicSettingsSchema.safeParse(base({ portalSubdomain: "" }));
    expect(r.success && r.data.portalSubdomain).toBeNull();
  });

  it.each(["admin", "login", "api", "coach", "student", "www", "app"])(
    "rejects reserved slug %s",
    (slug) => {
      expect(clinicSettingsSchema.safeParse(base({ portalSubdomain: slug })).success).toBe(
        false,
      );
    },
  );

  it.each(["ab", "-abc", "abc-", "a--b", "abc_def", "ABC!"])(
    "rejects malformed slug %s",
    (slug) => {
      expect(clinicSettingsSchema.safeParse(base({ portalSubdomain: slug })).success).toBe(
        false,
      );
    },
  );
});

describe("branding fields", () => {
  it("accepts a #rrggbb accent, rejects other formats", () => {
    expect(clinicSettingsSchema.safeParse(base({ accentColor: "#7c3aed" })).success).toBe(
      true,
    );
    expect(clinicSettingsSchema.safeParse(base({ accentColor: "red" })).success).toBe(false);
    const empty = clinicSettingsSchema.safeParse(base({ accentColor: "" }));
    expect(empty.success && empty.data.accentColor).toBeNull();
  });

  it("requires a valid site URL when set", () => {
    expect(
      clinicSettingsSchema.safeParse(base({ siteUrl: "https://studioforja.com.br" })).success,
    ).toBe(true);
    expect(clinicSettingsSchema.safeParse(base({ siteUrl: "notaurl" })).success).toBe(false);
  });
});

describe("public link helpers", () => {
  it("builds a wa.me link from a formatted number", () => {
    expect(whatsappUrl("+55 11 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(whatsappUrl(null)).toBeNull();
  });

  it("normalizes an Instagram handle or URL", () => {
    expect(instagramUrl("@studioforja")).toBe("https://instagram.com/studioforja");
    expect(instagramUrl("https://instagram.com/studioforja")).toBe(
      "https://instagram.com/studioforja",
    );
    expect(instagramUrl(null)).toBeNull();
  });

  it("gates branded portal to paid plans", () => {
    expect(canUseBrandedPortal("free")).toBe(false);
    expect(canUseBrandedPortal("solo")).toBe(true);
    expect(canUseBrandedPortal("clinica")).toBe(true);
    expect(canUseBrandedPortal("enterprise")).toBe(true);
  });
});

describe("portalPathPrefix", () => {
  it("puts student links under the portal when it is published", () => {
    expect(
      portalPathPrefix({
        portalSubdomain: "studio-forja",
        effectivePlan: "solo",
      }),
    ).toBe("/studio-forja");
  });

  it("is empty when the clinic has no slug", () => {
    expect(
      portalPathPrefix({ portalSubdomain: null, effectivePlan: "clinica" }),
    ).toBe("");
  });

  /**
   * The gate must match the one the public route applies. A prefix pointing at a
   * portal that will not resolve is a 404 mailed to a student — which is exactly
   * what happens if this reads the *stored* plan of a trialing clinic, or keeps
   * branding links after a downgrade.
   */
  it("is empty when the effective plan cannot publish a portal", () => {
    expect(
      portalPathPrefix({ portalSubdomain: "studio-forja", effectivePlan: "free" }),
    ).toBe("");
  });

  it("brands links for a trialing clinic, whose effective plan is paid", () => {
    // The caller resolves `effectivePlanOf` first, so a clinic stored as `free`
    // with a live trial arrives here as Solo/Clínica and gets its own address.
    expect(
      portalPathPrefix({ portalSubdomain: "studio-forja", effectivePlan: "clinica" }),
    ).toBe("/studio-forja");
  });
});

describe("accentThemeVars", () => {
  /**
   * The bug this closes: the accent was painted onto a handful of elements with
   * inline `backgroundColor`, so a clinic's portal showed its colour on the logo
   * square and the headline while every actual control — the sign-in button, the
   * invite CTA, focus rings — stayed Progresso green. Overriding the primary
   * token for the subtree is what makes those follow.
   */
  it("overrides the primary token so the whole subtree follows", () => {
    const vars = accentThemeVars("#7c3aed");
    expect(vars).toMatchObject({ "--primary": "#7c3aed", "--ring": "#7c3aed" });
  });

  it("derives the hover, press and tint steps from the accent", () => {
    const vars = accentThemeVars("#7c3aed")!;
    // Hover/press walk toward black, the tint toward white — the ramp the design
    // tokens describe, derived by the browser rather than a colour library.
    expect(vars["--primary-hover"]).toBe("color-mix(in srgb, #7c3aed 86%, black)");
    expect(vars["--primary-press"]).toBe("color-mix(in srgb, #7c3aed 72%, black)");
    expect(vars["--primary-light"]).toBe("color-mix(in srgb, #7c3aed 8%, white)");
  });

  it("returns nothing when the clinic set no accent", () => {
    // The caller then passes no `style` at all and the default palette stands.
    expect(accentThemeVars(null)).toBeUndefined();
    expect(accentThemeVars("")).toBeUndefined();
  });

  it("refuses anything that is not a literal #RRGGBB", () => {
    // This string goes straight into a style attribute. The settings schema
    // enforces the format on write; a row written before it must not be what
    // finds that out.
    expect(accentThemeVars("red")).toBeUndefined();
    expect(accentThemeVars("#fff")).toBeUndefined();
    expect(accentThemeVars("#7c3aed; background:url(x)")).toBeUndefined();
  });
});
