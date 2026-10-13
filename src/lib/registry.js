import { norm } from "./helpers.js";

// ============ EXERCISE REGISTRY ============
// The 873-exercise database (src/exdb.js) is loaded after first paint (see loadExdb), so everything
// here takes it as an argument and works with an empty list until it arrives.
let exdbPromise = null;
export const loadExdb = () => (exdbPromise ||= import("../exdb.js").then((m) => m.EXDB));

const indexes = new WeakMap(); // exdb array -> Map(normalized name -> entry)
const dbIndex = (exdb) => {
  if (!indexes.has(exdb)) indexes.set(exdb, new Map(exdb.map((t) => [norm(t[0]), t])));
  return indexes.get(exdb);
};
// Everyday gym names -> the closest exercise-database entry. Logged/custom exercises with these
// names borrow that entry's equipment (for tags/filters) and demo images. Nothing is renamed.
// Every target is checked to exist by the test harness.
export const ALIASES = {
  "bench press": "Barbell Bench Press - Medium Grip", "barbell bench press": "Barbell Bench Press - Medium Grip",
  "incline bench press": "Barbell Incline Bench Press - Medium Grip",
  "squat": "Barbell Full Squat", "squats": "Barbell Full Squat", "back squat": "Barbell Full Squat",
  "deadlift": "Barbell Deadlift", "deadlifts": "Barbell Deadlift", "rdl": "Romanian Deadlift",
  "hip thrust": "Barbell Hip Thrust", "hip thrusts": "Barbell Hip Thrust",
  "lat pulldown": "Wide-Grip Lat Pulldown", "lat pulldowns": "Wide-Grip Lat Pulldown", "lat pull down": "Wide-Grip Lat Pulldown",
  "leg extension": "Leg Extensions", "leg curl": "Seated Leg Curl", "leg curls": "Seated Leg Curl",
  "calf raise": "Standing Calf Raises", "calf raises": "Standing Calf Raises",
  "adductor": "Thigh Adductor", "abductor": "Thigh Abductor",
  "lateral raise": "Side Lateral Raise", "lateral raises": "Side Lateral Raise", "lat raise": "Side Lateral Raise",
  "shoulder press": "Dumbbell Shoulder Press", "overhead press": "Barbell Shoulder Press",
  "machine shoulder press": "Machine Shoulder (Military) Press",
  "chest press": "Leverage Chest Press", "machine chest press": "Leverage Chest Press",
  "incline chest press": "Leverage Incline Chest Press", "chest fly": "Butterfly", "pec deck": "Butterfly",
  "dumbbell fly": "Dumbbell Flyes", "cable fly": "Cable Crossover",
  "seated row": "Seated Cable Rows", "seated rows": "Seated Cable Rows", "cable row": "Seated Cable Rows",
  "close grip row": "Seated Cable Rows", "barbell row": "Bent Over Barbell Row", "dumbbell row": "One-Arm Dumbbell Row",
  "t-bar row": "T-Bar Row with Handle", "t-bar row wide": "T-Bar Row with Handle",
  "back extension": "Hyperextensions (Back Extensions)", "back extensions": "Hyperextensions (Back Extensions)",
  "tricep pushdown": "Triceps Pushdown", "triceps pushdown": "Triceps Pushdown",
  "tricep pushdown single arm": "Cable One Arm Tricep Extension",
  "overhead tricep": "Cable Rope Overhead Triceps Extension", "overhead tricep extension": "Cable Rope Overhead Triceps Extension",
  "dips": "Dips - Triceps Version",
  "bicep curl": "Dumbbell Bicep Curl", "biceps curl": "Dumbbell Bicep Curl", "hammer curl": "Hammer Curls",
  "preacher curl": "Preacher Curl", "concentration curl": "Concentration Curls", "reverse curl": "Reverse Barbell Curl",
  "cable curl": "Standing Biceps Cable Curl", "bayesian curl": "Standing One-Arm Cable Curl",
  "abs": "Ab Crunch Machine", "ab crunch": "Ab Crunch Machine", "crunch": "Crunches",
  "pull ups": "Pullups", "pull-ups": "Pullups", "pullup": "Pullups", "chin ups": "Chin-Up", "chin-ups": "Chin-Up",
  "push ups": "Pushups", "push-ups": "Pushups", "pushup": "Pushups", "lunges": "Dumbbell Lunges",
};
// Resolve a logged/custom name to a DB entry: exact alias, else singular/plural variant.
export function dbMatch(k, exdb) {
  const idx = dbIndex(exdb);
  if (ALIASES[k]) return idx.get(norm(ALIASES[k])) || null;
  return idx.get(k + "s") || (k.endsWith("s") ? idx.get(k.slice(0, -1)) : null) || null;
}

const NO_EXDB = [];
export function buildRegistry(customExercises, workouts, exdb = NO_EXDB) {
  const map = new Map();
  for (const w of workouts) for (const e of w.entries) {
    const k = norm(e.exercise);
    if (!map.has(k)) map.set(k, { name: e.exercise, muscle: e.muscle || "other", equipment: "", img: "", source: "log" });
  }
  for (const c of customExercises) {
    map.set(norm(c.name), { name: c.name, muscle: c.muscle, equipment: c.equipment || "", img: "", source: "custom" });
  }
  for (const [name, muscle, equipment, img] of exdb) {
    const k = norm(name);
    // In the source DB, blank equipment means none is needed (push-ups, lunges, stretches).
    const eq = equipment || "body only";
    if (!map.has(k)) map.set(k, { name, muscle, equipment: eq, img: img || "", source: "db" });
    else {
      // A logged/custom exercise that matches a DB entry inherits its demo images and equipment.
      const cur = map.get(k);
      if (img && !cur.img) cur.img = img;
      if (!cur.equipment) cur.equipment = eq;
    }
  }
  // Everyday names ("bench press") -> borrow equipment + demo from the closest DB entry.
  for (const [k, cur] of map) {
    if (cur.source === "db" || (cur.img && cur.equipment)) continue;
    const t = dbMatch(k, exdb);
    if (!t) continue;
    if (!cur.img && t[3]) cur.img = t[3];
    if (!cur.equipment) cur.equipment = t[2] || "body only";
  }
  return map;
}

export function lastPerformance(workouts, exName, excludeId) {
  const k = norm(exName);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    const entry = w.entries.find((e) => norm(e.exercise) === k);
    if (entry && entry.sets.some((s) => s.weight != null || s.reps || s.time > 0)) return { date: w.date, day: w.name, sets: entry.sets, kind: entry.kind || "strength" };
  }
  return null;
}

// Most recent non-empty note left on this exercise (v12), e.g. "seat 4, pin 7".
export function lastNote(workouts, exName, excludeId) {
  const k = norm(exName);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    const entry = (w.entries || []).find((e) => norm(e.exercise) === k && e.note && e.note.trim());
    if (entry) return { date: w.date, note: entry.note.trim() };
  }
  return null;
}

export function similarPerformances(workouts, registry, exName, excludeId, limit = 4) {
  const k = norm(exName);
  const meta = registry.get(k);
  const muscle = meta ? meta.muscle : "other";
  const seen = new Set([k]);
  const out = [];
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    for (const e of w.entries) {
      const ek = norm(e.exercise);
      if (seen.has(ek) || e.kind === "cardio") continue;
      const em = registry.get(ek);
      const emu = em ? em.muscle : e.muscle;
      if (emu !== muscle) continue;
      if (!e.sets.some((s) => s.weight != null || s.reps || s.time > 0)) continue;
      seen.add(ek);
      out.push({ exercise: e.exercise, date: w.date, sets: e.sets });
      if (out.length >= limit) return { muscle, items: out };
    }
  }
  return { muscle, items: out };
}
