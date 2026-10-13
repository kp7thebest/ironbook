import { uid } from "./helpers.js";
import { blankSet } from "./session.js";

// ============ SAVED ROUTINES (v13, N6) ============
// A routine stores the exercise list only: names, muscles, and per set whether it's a warm-up.

// Session/draft entries -> routine entries (weights, reps and notes dropped).
export const toRoutineEntries = (entries) =>
  (entries || []).filter((e) => e.exercise && e.exercise.trim()).map((e) => ({
    exercise: e.exercise, muscle: e.muscle || "other", ...(e.kind === "cardio" ? { kind: "cardio" } : {}),
    sets: ((e.sets && e.sets.length) ? e.sets : [{}]).map((s) => (s.warmup ? { warmup: true } : {})),
  }));

// Routine -> fresh draft entries with empty sets, ready to fill in.
export const routineToDraftEntries = (routine) =>
  (routine.entries || []).map((e) => ({
    id: uid(), exercise: e.exercise, muscle: e.muscle, ...(e.kind === "cardio" ? { kind: "cardio" } : {}),
    sets: (e.sets && e.sets.length ? e.sets : [{}]).map((s) => blankSet(e.kind, s.warmup)),
  }));

// The routines table doesn't exist until supabase/patch_routines.sql has been run.
export const isMissingTable = (e) =>
  Boolean(e) && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message || ""));
