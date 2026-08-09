import { isGroupingTechnique, type WorkoutTechnique } from "@/lib/workout-techniques";

/**
 * Assigns super-set / giant-set `groupId`s to an ordered list of exercises.
 *
 * A grouping technique **chains forward**: marking an exercise as super set /
 * giant set links it — without rest — into the **following** exercise, so a pair
 * only needs its first item marked. The block keeps extending while consecutive
 * items carry the same grouping technique, and closes on the first item that
 * doesn't (that item is the block's tail, still part of the block). A lone marked
 * item with nothing after it forms no block (its `groupId` is dropped to `null`).
 *
 * Pure and client-safe; `newId` is injected so callers control id generation
 * (the builder passes `crypto.randomUUID`; tests pass a deterministic counter).
 */
export function assignGroupIds<T extends { technique: WorkoutTechnique | null }>(
  exercises: T[],
  newId: () => string,
): { exercise: T; groupId: string | null }[] {
  const out: { exercise: T; groupId: string | null }[] = [];
  let runId: string | null = null;
  let runTech: WorkoutTechnique | null = null;
  for (const ex of exercises) {
    if (runId) {
      // Inside an open block: this item belongs to it (as a middle link or the
      // tail). It keeps the block open only if it also chains with the same tech.
      out.push({ exercise: ex, groupId: runId });
      if (!(isGroupingTechnique(ex.technique) && ex.technique === runTech)) {
        runId = null;
        runTech = null;
      }
    } else if (isGroupingTechnique(ex.technique)) {
      runId = newId();
      runTech = ex.technique;
      out.push({ exercise: ex, groupId: runId });
    } else {
      out.push({ exercise: ex, groupId: null });
    }
  }
  // Drop blocks that never chained into a following exercise (size 1).
  const counts = new Map<string, number>();
  for (const o of out) {
    if (o.groupId) counts.set(o.groupId, (counts.get(o.groupId) ?? 0) + 1);
  }
  return out.map((o) =>
    o.groupId && counts.get(o.groupId) === 1 ? { ...o, groupId: null } : o,
  );
}
