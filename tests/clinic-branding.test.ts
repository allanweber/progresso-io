import { describe, expect, it } from "vitest";

import {
  canUseBrandedPortal,
  clinicSettingsSchema,
  instagramUrl,
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
