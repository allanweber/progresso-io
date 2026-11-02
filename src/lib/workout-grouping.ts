export function supersetGroupIds<T extends { linked: boolean }>(
  exercises: T[],
  newId: () => string,
): (string | null)[] {
  const ids: (string | null)[] = [];
  exercises.forEach((ex, i) => {
    const next = exercises[i + 1];
    if (i > 0 && ex.linked) ids.push(ids[i - 1]);
    else ids.push(next?.linked ? newId() : null);
  });
  return ids;
}

export function detachExercise<T extends { linked: boolean }>(exercises: T[], index: number): T[] {
  const removed = exercises[index];
  const keepLink = index > 0 && removed.linked;
  return exercises
    .filter((_, i) => i !== index)
    .map((ex, i) => (i === index && ex.linked && !keepLink ? { ...ex, linked: false } : ex));
}

export function moveExercise<T extends { linked: boolean }>(exercises: T[], from: number, to: number): T[] {
  const next = detachExercise(exercises, from);
  next.splice(to, 0, { ...exercises[from], linked: false });
  return next;
}
