import { KG_PER_LB } from "./constants.js";

// ============ STRENGTH MATH (1-rep max estimation) ============
// Reps may be unilateral ("6,6" = 6 each side) -> use the average of the parts.
export const repsValue = (r) => {
  if (r == null || r === "") return null;
  const parts = String(r).split(",").map((x) => parseFloat(x)).filter((x) => !isNaN(x) && x > 0);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
};
// Average of Epley and Brzycki: the two most widely used formulas; they agree closely under ~10 reps.
export function est1RM(w, r) {
  if (w == null || r == null || !(w > 0) || !(r > 0)) return null;
  if (r <= 1) return w;
  const epley = w * (1 + r / 30);
  const brzycki = r < 37 ? (w * 36) / (37 - r) : epley;
  return (epley + brzycki) / 2;
}
// Inverse: the weight you should manage for `r` reps given a 1RM.
export function weightForReps(oneRM, r) {
  if (!(oneRM > 0)) return null;
  if (r <= 1) return oneRM;
  return (oneRM / (1 + r / 30) + (oneRM * (37 - r)) / 36) / 2;
}
// Work sets = everything except sets marked as warm-ups (v13). Warm-ups never count toward a top set,
// an estimated 1RM, a PR or weekly volume.
export const workSets = (sets) => (sets || []).filter((s) => !s.warmup);

// Best (highest) estimated 1RM across a list of sets (warm-ups ignored).
export function bestE1(sets) {
  let best = null;
  for (const s of workSets(sets)) {
    const e = est1RM(s.weight != null ? Number(s.weight) : null, repsValue(s.reps));
    if (e != null && (!best || e > best.e1)) best = { e1: e, weight: Number(s.weight), reps: s.reps };
  }
  return best;
}
export const roundTo = (v, step) => Math.round(v / step) * step;
// A kg weight shown in the user's unit, rounded to a loadable increment (0.5 kg / 1 lb).
export const fmtLoad = (kg, unit) => {
  if (kg == null) return "–";
  const v = unit === "lbs" ? kg / KG_PER_LB : kg;
  return String(roundTo(v, unit === "lbs" ? 1 : 0.5));
};
