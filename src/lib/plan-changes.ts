import type { DietStructure } from "@/lib/student-diets";
import type { WorkoutStructure } from "@/lib/student-workouts";

/**
 * Whether publishing a draft would actually change anything for the aluno.
 *
 * Publishing is not a save: it numbers a version, freezes it into the histórico
 * and pings the student on WhatsApp. Doing that for a draft nobody edited buys
 * the aluno a notification about a program that did not move and leaves the
 * coach with two identical versions to tell apart, so the publish paths compare
 * first and stand pat when nothing changed.
 *
 * The comparison is by value, not by bytes:
 * - **key order is ignored** — jsonb hands a stored tree back in its own order;
 * - **groupId identity is ignored** — the builder mints a fresh uuid for every
 *   super/giant block on every payload it builds, so two byte-identical workouts
 *   would never match; what matters is *which items share a block*, not its name.
 *
 * When in doubt it reports a change: a tree stored before a field existed reads
 * as different and publishes a version, which is the harmless direction.
 */
export type PublishedWorkout = {
  name: string;
  notes: string | null;
  cardio: string | null;
  tree: WorkoutStructure;
};

export type PublishedDiet = {
  name: string;
  notes: string | null;
  tree: DietStructure;
};

export function workoutChanged(
  a: PublishedWorkout,
  b: PublishedWorkout,
): boolean {
  return (
    a.name !== b.name ||
    a.notes !== b.notes ||
    a.cardio !== b.cardio ||
    stable(withOrdinalGroupIds(a.tree)) !== stable(withOrdinalGroupIds(b.tree))
  );
}

export function dietChanged(a: PublishedDiet, b: PublishedDiet): boolean {
  return (
    a.name !== b.name ||
    a.notes !== b.notes ||
    stable(a.tree) !== stable(b.tree)
  );
}

/**
 * Replaces every groupId with its position of first appearance in the ficha
 * (`g0`, `g1`, …), so the *shape* of the blocks is compared rather than the
 * throwaway uuids the builder assigns them.
 */
function withOrdinalGroupIds(tree: WorkoutStructure): WorkoutStructure {
  return {
    sessions: (tree?.sessions ?? []).map((session) => {
      const seen = new Map<string, string>();
      return {
        ...session,
        items: session.items.map((item) => {
          if (!item.groupId) return { ...item, groupId: null };
          const ordinal = seen.get(item.groupId) ?? `g${seen.size}`;
          seen.set(item.groupId, ordinal);
          return { ...item, groupId: ordinal };
        }),
      };
    }),
  };
}

/** JSON with object keys sorted at every depth (arrays keep their order). */
function stable(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}
