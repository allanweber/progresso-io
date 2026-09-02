import { describe, expect, it } from "vitest";

import type { ClinicSettingsDto } from "@/lib/clinic-settings";
import {
  ONBOARDING_STEP_LABELS,
  allSelected,
  onboardingSteps,
  selectableKeys,
  settingsChanges,
  toggleAll,
} from "@/lib/onboarding";
import { STARTER_CATALOG, STARTER_KEYS } from "@/server/starters/catalog";

/**
 * The setup guide's pure parts: which steps a clinic walks through, the catalog
 * it lists, and the diff it confirms before overwriting anything on a re-run.
 */

const settings: ClinicSettingsDto = {
  name: "Studio Forja",
  portalSubdomain: "studio-forja",
  headline: "Treino e nutrição",
  description: null,
  whatsapp: null,
  instagram: null,
  siteUrl: null,
  accentColor: "#2F6F4E",
  hasLogo: false,
  feedbackFrequency: "semanal",
  feedbackPreferredDay: "monday",
  feedbackWhatsappReminder: true,
  plan: "clinica",
  brandedPortal: true,
  onboardingCompletedAt: null,
};

/** The values a step would send if the coach changed nothing. */
const unchanged = {
  feedbackFrequency: settings.feedbackFrequency,
  feedbackPreferredDay: settings.feedbackPreferredDay,
  feedbackWhatsappReminder: settings.feedbackWhatsappReminder,
  portalSubdomain: settings.portalSubdomain,
  headline: settings.headline,
  accentColor: settings.accentColor,
};

describe("onboardingSteps", () => {
  it("gives each starter domain its own step", () => {
    // Thirty templates on one screen was a wall; one domain per screen is what
    // keeps the first thing a new coach meets short enough to read.
    expect(
      onboardingSteps({ team: { enabled: false }, portal: { enabled: false } }),
    ).toEqual(["dietas", "treinos", "anamneses", "feedback", "pronto"]);
  });

  it("adds Equipe and Portal for the Clínica branch", () => {
    expect(
      onboardingSteps({ team: { enabled: true }, portal: { enabled: true } }),
    ).toEqual([
      "dietas",
      "treinos",
      "anamneses",
      "feedback",
      "equipe",
      "portal",
      "pronto",
    ]);
  });

  it("can offer the team without the portal", () => {
    // A team-capable clinic whose branding is not permitted (or is already the
    // clinic's own concern) still gets the invite step.
    expect(
      onboardingSteps({ team: { enabled: true }, portal: { enabled: false } }),
    ).toEqual(["dietas", "treinos", "anamneses", "feedback", "equipe", "pronto"]);
  });

  it("labels every step", () => {
    for (const step of onboardingSteps({
      team: { enabled: true },
      portal: { enabled: true },
    })) {
      expect(ONBOARDING_STEP_LABELS[step]).toBeTruthy();
    }
  });
});

describe("selection maths", () => {
  const items = [{ key: "a" }, { key: "b" }, { key: "c" }];

  it("offers only what the clinic does not already hold", () => {
    expect(selectableKeys(items, ["b"])).toEqual(["a", "c"]);
  });

  it("selects everything, and clears back to just the owned ones", () => {
    expect([...toggleAll(items, ["b"], true)]).toEqual(["a", "b", "c"]);
    // Clearing keeps "b": an owned template is never removed by the guide.
    expect([...toggleAll(items, ["b"], false)]).toEqual(["b"]);
  });

  it("is 'all selected' only when every selectable one is ticked", () => {
    expect(allSelected(items, ["b"], new Set(["a", "b", "c"]))).toBe(true);
    expect(allSelected(items, ["b"], new Set(["a", "b"]))).toBe(false);
    // Owned templates count as ticked whether or not they are in the set.
    expect(allSelected(items, ["b"], new Set(["a", "c"]))).toBe(true);
  });

  /**
   * The regression this pair exists for: when the clinic already owns every
   * template, clearing cannot change anything (owned keys survive), so
   * `allSelected` stays true and the control would sit there offering "Limpar
   * seleção" forever. `selectableKeys` being empty is what the UI checks to hide
   * it — this asserts the condition the UI keys off actually holds.
   */
  it("has nothing to toggle when the clinic owns everything", () => {
    const owned = ["a", "b", "c"];
    expect(selectableKeys(items, owned)).toEqual([]);
    expect(allSelected(items, owned, new Set(owned))).toBe(false);
    expect([...toggleAll(items, owned, false)]).toEqual(owned);
  });
});

describe("settingsChanges", () => {
  it("is empty when nothing moved", () => {
    expect(settingsChanges(settings, unchanged)).toEqual([]);
  });

  it("names each overwritten field, from → to, in the coach's words", () => {
    const changes = settingsChanges(settings, {
      ...unchanged,
      feedbackFrequency: "quinzenal",
      feedbackPreferredDay: "wednesday",
    });

    expect(changes).toEqual([
      { label: "Frequência de check-in", from: "Semanal", to: "Quinzenal" },
      { label: "Dia preferido", from: "Segunda-feira", to: "Quarta-feira" },
    ]);
  });

  it("reports a cleared value as empty rather than omitting it", () => {
    // Clearing the portal slug is exactly the kind of change a coach must see
    // before it happens — it takes their microsite offline.
    const changes = settingsChanges(settings, {
      ...unchanged,
      portalSubdomain: null,
    });
    expect(changes).toEqual([
      { label: "Endereço do portal", from: "studio-forja", to: "vazio" },
    ]);
  });

  it("treats null and empty string as the same non-change", () => {
    const blank: ClinicSettingsDto = { ...settings, headline: null };
    expect(settingsChanges(blank, { ...unchanged, headline: "" })).toEqual([]);
  });

  it("reports the WhatsApp reminder as Ativo/Inativo", () => {
    expect(
      settingsChanges(settings, { ...unchanged, feedbackWhatsappReminder: false }),
    ).toEqual([
      { label: "Lembrete por WhatsApp", from: "Ativo", to: "Inativo" },
    ]);
  });
});

describe("starter catalog", () => {
  it("offers every starter, with a name and a shape hint", () => {
    expect(STARTER_CATALOG.diets).toHaveLength(13);
    expect(STARTER_CATALOG.workouts).toHaveLength(11);
    expect(STARTER_CATALOG.anamneses).toHaveLength(6);

    for (const item of [
      ...STARTER_CATALOG.diets,
      ...STARTER_CATALOG.workouts,
      ...STARTER_CATALOG.anamneses,
    ]) {
      expect(item.key).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.hint).toBeTruthy();
    }
  });

  it("hints at the shape a coach is choosing between", () => {
    const abc = STARTER_CATALOG.workouts.find((w) => w.key === "abc-hipertrofia");
    expect(abc?.hint).toBe("Intermediário · 3 sessões · 15 exercícios");

    const emagrecimento = STARTER_CATALOG.diets.find(
      (d) => d.key === "emagrecimento",
    );
    expect(emagrecimento?.hint).toMatch(/^4 refeições · \d+ alimentos$/);
  });

  it("carries no template body — only the summary reaches the browser", () => {
    // The 30 starter JSONs are megabytes of meals, sets and questions. The guide
    // lists them; it must never ship them.
    for (const item of STARTER_CATALOG.diets) {
      expect(Object.keys(item).sort()).toEqual([
        "description",
        "hint",
        "key",
        "name",
      ]);
    }
  });

  it("exposes the key allow-list the import route filters against", () => {
    expect(STARTER_KEYS.diets).toContain("emagrecimento");
    expect(STARTER_KEYS.workouts).toContain("abc-hipertrofia");
    expect(STARTER_KEYS.anamneses).toContain("hipertrofia");
    expect(STARTER_KEYS.diets).not.toContain("abc-hipertrofia");
  });
});
