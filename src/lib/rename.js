import { norm } from "./helpers.js";

// ============ RENAME / MERGE AN EXERCISE ACROSS MY LOG (v12) ============
// Exercise identity is its name, so renaming used to split history in two. This rewrites every past
// session that uses `oldName`. If `newName` is already in the log, the two merge into one history.
// Returns the workouts that change, as { id, data } for the sync queue — nothing else is touched.
export function renameInWorkouts(workouts, oldName, newName, newMuscle) {
  const from = norm(oldName);
  const to = newName.trim().replace(/\s+/g, " ");
  if (!from || !to || norm(to) === from && to === oldName) return [];
  const changes = [];
  for (const w of workouts) {
    if (!(w.entries || []).some((e) => norm(e.exercise) === from)) continue;
    const entries = w.entries.map((e) => (norm(e.exercise) === from
      ? { ...e, exercise: to, muscle: newMuscle || e.muscle }
      : e));
    changes.push({ id: w.id, data: { date: w.date, name: w.name, entries } });
  }
  return changes;
}

// Logged exercise names (as last written) other than `name` — for the merge suggestions.
export function loggedNames(workouts, except) {
  const seen = new Map();
  const skip = norm(except || "");
  for (const w of workouts) for (const e of w.entries || []) {
    const k = norm(e.exercise);
    if (k !== skip && !seen.has(k)) seen.set(k, e.exercise);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
