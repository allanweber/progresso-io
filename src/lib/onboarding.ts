import type { ClinicSettingsDto } from "@/lib/clinic-settings";
import {
  FEEDBACK_FREQUENCY_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/clinic-settings";
import type { StarterCatalogDto, StarterOwnedKeys } from "@/lib/starters";

/**
 * Client-safe contract for the setup guide at `/onboarding` — the flow a coach
 * lands in right after sign-up, and can re-run from Configurações.
 *
 * The guide writes nothing new: every step commits through an endpoint that
 * already exists (`/api/clinic/starters/ensure`, `PUT /api/coach/settings`,
 * `POST /api/coach/team`). What lives here is only the state it needs to decide
 * *which* steps to show, plus the re-run diff it confirms before overwriting
 * anything.
 */

/**
 * Which optional steps this clinic gets, resolved on the server.
 *
 * The Clínica branch is decided by capability, never by the stored plan string:
 * a coach who picked Clínica at sign-up is stored as `free` for 14 days while
 * genuinely holding Clínica limits (see `trialPlanFor`), and gating the steps on
 * the stored plan would hide exactly the two features they are evaluating.
 */
export type OnboardingStateDto = {
  /** When the guide was finished or skipped, ISO. Null = first run. */
  completedAt: string | null;
  /**
   * Whether this clinic has already been through a starter import. Decides what
   * skipping means: a coach who skips before choosing anything gets the whole
   * library (what the old automatic seed gave everyone), while skipping a re-run
   * imports nothing — those templates were left out on purpose.
   */
  startersSeeded: boolean;
  /** Every starter on offer, flattened to name + description + shape hint. */
  catalog: StarterCatalogDto;
  /** What the clinic already holds — ticked and disabled on a re-run. */
  owned: StarterOwnedKeys;
  /** Equipe step: owner of a team-capable clinic, with seats left to fill. */
  team: { enabled: boolean; seatsAvailable: number };
  /** Portal step: the Clínica branch, and branding actually permitted. */
  portal: { enabled: boolean };
  /** Show the Clínica line on the final screen (a clinic without a team plan). */
  upsellClinica: boolean;
};

/**
 * The guide's steps, in order. The two Clínica ones drop out for Solo.
 *
 * The three starter domains are three steps rather than one: thirty templates on
 * a single screen is a wall, and the first thing a brand-new coach meets should
 * not be a scroll. One domain per screen also makes "selecionar todos" mean one
 * unambiguous thing.
 */
export const ONBOARDING_STEPS = [
  "dietas",
  "treinos",
  "anamneses",
  "feedback",
  "equipe",
  "portal",
  "pronto",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** One-word labels for the step indicator (the headings inside say more). */
export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  dietas: "Dietas",
  treinos: "Treinos",
  anamneses: "Anamneses",
  feedback: "Feedback",
  equipe: "Equipe",
  portal: "Portal",
  pronto: "Pronto",
};

/** The catalog domain a starter step selects from. */
export type StarterDomain = "diets" | "workouts" | "anamneses";

/** Which domain each starter step chooses from. */
export const STEP_DOMAIN: Record<
  "dietas" | "treinos" | "anamneses",
  StarterDomain
> = {
  dietas: "diets",
  treinos: "workouts",
  anamneses: "anamneses",
};

/** The steps this clinic actually walks through. */
export function onboardingSteps(state: {
  team: { enabled: boolean };
  portal: { enabled: boolean };
}): OnboardingStep[] {
  return ONBOARDING_STEPS.filter(
    (step) =>
      (step !== "equipe" || state.team.enabled) &&
      (step !== "portal" || state.portal.enabled),
  );
}

/* -------------------------------------------------------------------------- */
/*  Selection maths                                                            */
/* -------------------------------------------------------------------------- */

/** The subset of a starter the selection maths needs. */
type Keyed = { key: string };

/**
 * The templates a coach can still decide about — everything the clinic does not
 * already hold. An owned template is ticked and locked: the guide only ever
 * adds, so offering to untick one would promise a removal it never performs.
 */
export function selectableKeys(items: Keyed[], owned: string[]): string[] {
  return items.map((i) => i.key).filter((key) => !owned.includes(key));
}

/** Whether every *selectable* template is currently ticked. */
export function allSelected(
  items: Keyed[],
  owned: string[],
  chosen: ReadonlySet<string>,
): boolean {
  const selectable = selectableKeys(items, owned);
  return selectable.length > 0 && selectable.every((key) => chosen.has(key));
}

/**
 * What "selecionar todos" / "limpar seleção" produces.
 *
 * Clearing keeps the owned keys, because those are going nowhere — which is
 * exactly why the control must be hidden when there is nothing selectable. On a
 * clinic that already holds every starter, clearing returns the same set it was
 * given, and a button that cannot change anything while still offering to is
 * worse than no button: it reads as broken, because it is.
 */
export function toggleAll(
  items: Keyed[],
  owned: string[],
  on: boolean,
): Set<string> {
  return new Set(
    on ? items.map((i) => i.key) : items.map((i) => i.key).filter((key) => owned.includes(key)),
  );
}

/* -------------------------------------------------------------------------- */
/*  Re-run diff                                                                */
/* -------------------------------------------------------------------------- */

/** One setting the guide is about to overwrite, in the coach's words. */
export type SettingsChange = { label: string; from: string; to: string };

/** How an empty/unset value reads in the confirmation dialog. */
const EMPTY = "vazio";

function portalValue(value: string | null): string {
  return value?.trim() ? value : EMPTY;
}

/**
 * The settings a re-run would change, field by field.
 *
 * Shown in a confirmation dialog before the guide commits, because a coach who
 * re-opened it to add one template should never discover afterwards that it also
 * moved their check-in day back to the default. Pure, so the dialog and the
 * tests agree on what counts as a change; an untouched field never appears.
 */
export function settingsChanges(
  before: ClinicSettingsDto,
  after: Pick<
    ClinicSettingsDto,
    | "feedbackFrequency"
    | "feedbackPreferredDay"
    | "feedbackWhatsappReminder"
    | "portalSubdomain"
    | "headline"
    | "accentColor"
  >,
): SettingsChange[] {
  const changes: SettingsChange[] = [];

  if (before.feedbackFrequency !== after.feedbackFrequency) {
    changes.push({
      label: "Frequência de check-in",
      from: FEEDBACK_FREQUENCY_LABELS[before.feedbackFrequency].label,
      to: FEEDBACK_FREQUENCY_LABELS[after.feedbackFrequency].label,
    });
  }
  if (before.feedbackPreferredDay !== after.feedbackPreferredDay) {
    changes.push({
      label: "Dia preferido",
      from: WEEKDAY_LABELS[before.feedbackPreferredDay],
      to: WEEKDAY_LABELS[after.feedbackPreferredDay],
    });
  }
  if (before.feedbackWhatsappReminder !== after.feedbackWhatsappReminder) {
    changes.push({
      label: "Lembrete por WhatsApp",
      from: before.feedbackWhatsappReminder ? "Ativo" : "Inativo",
      to: after.feedbackWhatsappReminder ? "Ativo" : "Inativo",
    });
  }
  if ((before.portalSubdomain ?? "") !== (after.portalSubdomain ?? "")) {
    changes.push({
      label: "Endereço do portal",
      from: portalValue(before.portalSubdomain),
      to: portalValue(after.portalSubdomain),
    });
  }
  if ((before.headline ?? "") !== (after.headline ?? "")) {
    changes.push({
      label: "Chamada do portal",
      from: portalValue(before.headline),
      to: portalValue(after.headline),
    });
  }
  if ((before.accentColor ?? "") !== (after.accentColor ?? "")) {
    changes.push({
      label: "Cor de destaque",
      from: portalValue(before.accentColor),
      to: portalValue(after.accentColor),
    });
  }

  return changes;
}
