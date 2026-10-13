// ============ WORKOUT EFFORT 1–10 (v14) ============
// Stored in workouts.effort (added by supabase/patch_workout_effort.sql). Until that patch is run the
// column doesn't exist; db.js then leaves effort out of every read and write so nothing else breaks.

export const EFFORT_LABELS = ["", "Very easy", "Very easy", "Easy", "Easy", "Moderate", "Moderate", "Hard", "Hard", "Very hard", "Max effort"];
export const effortLabel = (n) => (n >= 1 && n <= 10 ? EFFORT_LABELS[n] : "");
export const validEffort = (n) => (Number.isInteger(n) && n >= 1 && n <= 10 ? n : null);

// Postgres "undefined column" (42703) on reads; PostgREST "column not in schema cache" (PGRST204) on writes.
export const isMissingColumn = (e, col = "effort") =>
  Boolean(e) && (e.code === "42703" || e.code === "PGRST204") && new RegExp(col, "i").test(`${e.message || ""} ${e.details || ""} ${e.hint || ""}`);

// Runs `run(withCol)`; if the column turns out to be missing, remembers that in `state` and retries without it.
// state = { has: true | false }  (starts true: optimistic, so the column is used as soon as the patch is run)
export async function withOptionalColumn(state, run, col = "effort") {
  if (!state.has) return run(false);
  try {
    return await run(true);
  } catch (e) {
    if (!isMissingColumn(e, col)) throw e;
    state.has = false;
    return run(false);
  }
}
