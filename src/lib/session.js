import { KM_PER_MI, cardioLine, distUnit, fmtDuration, kmToDisplay, norm } from "./helpers.js";
export { KM_PER_MI, cardioLine, distUnit, fmtDuration, kmToDisplay };
import { validEffort } from "./effort.js";

// ============ CARDIO (v14) ============
// A cardio entry has kind "cardio" and sets of { time (seconds), distance? (km), warmup? } instead of
// { weight, reps }. Distance is shown in km or miles following the kg/lbs setting.

const CARDIO_RE = /\b(treadmill|running|jogging|jog|cycling|bicycling|bike ride|spin(ning)? (bike|class)|stationary bike|recumbent bike|assault bike|elliptical|cross[- ]?trainer|rowing machine|rowing, stationary|row machine|rower|ergometer|ski ?erg|stair ?master|stair ?climber|step mill|swimming|swim|walking|incline walk|jump(ing)? rope|rope jumping|skipping|hiit|cardio)\b/i;
const NOT_CARDIO_RE = /\b(lunges?|farmer.?s?|monster|yoke|sled|carry|carries|crunch(es)?|stretch(es)?|push(es)?|release)\b/i;
export const isCardioName = (name) => {
  const n = String(name || "");
  return CARDIO_RE.test(n) && !NOT_CARDIO_RE.test(n) || /^(run|walk|bike|row|swim|cycle)$/i.test(n.trim());
};

// The kind to use when adding an exercise: whatever you used last time, else a guess from the name.
export function kindFor(name, workouts) {
  const k = norm(name || "");
  const sorted = [...(workouts || [])].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const e = (w.entries || []).find((x) => norm(x.exercise) === k);
    if (e) return e.kind === "cardio" ? "cardio" : "strength";
  }
  return isCardioName(name) ? "cardio" : "strength";
}

// "25" -> 25 min, "25:30" -> 25 min 30 s, "1:05:00" -> 1 h 5 min. Returns seconds, or null if not a time.
export function parseDuration(str) {
  const s = String(str ?? "").trim().replace(/[.,]/g, ":");
  if (!s) return null;
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(s)) return null;
  const p = s.split(":").map(Number);
  let sec;
  if (p.length === 1) sec = p[0] * 60;
  else if (p.length === 2) { if (p[1] > 59) return null; sec = p[0] * 60 + p[1]; }
  else { if (p[1] > 59 || p[2] > 59) return null; sec = p[0] * 3600 + p[1] * 60 + p[2]; }
  return sec > 0 ? sec : null;
}
// "1 h 05 min" / "45 min" for totals
export function fmtMinutes(sec) {
  const m = Math.round((sec || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}
export const displayToKm = (v, unit) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  if (!(n > 0)) return null;
  return Math.round((unit === "lbs" ? n * KM_PER_MI : n) * 1000) / 1000;
};
export const isCardio = (entry) => Boolean(entry) && entry.kind === "cardio";
// An empty set to fill in, of the right shape for the entry's kind.
export const blankSet = (kind, warmup) => ({ ...(kind === "cardio" ? { time: null, distance: null } : { weight: null, reps: "" }), ...(warmup ? { warmup: true } : {}) });
export const cardioSetDone = (s) => s && s.time > 0;
// Average pace for a total: "5:30 /km" (or /mi)
export function paceLine(total, unit) {
  const d = unit === "lbs" ? total.distance / KM_PER_MI : total.distance;
  if (!(d > 0) || !(total.time > 0)) return "";
  return `${fmtDuration(total.time / d)} /${distUnit(unit)}`;
}

// ============ SAVING A SESSION ============
// The draft (with ids, raw input strings) -> what is stored: empty sets dropped, effort validated.
export function cleanEntry(e) {
  const base = { exercise: e.exercise, muscle: e.muscle };
  if (isCardio(e)) {
    base.kind = "cardio";
    base.sets = (e.sets || []).filter(cardioSetDone).map((s) => ({
      time: Math.round(s.time), ...(s.distance > 0 ? { distance: s.distance } : {}), ...(s.warmup ? { warmup: true } : {}),
    }));
  } else {
    base.sets = (e.sets || []).filter((s) => s.weight != null || s.reps).map((s) => ({
      weight: s.weight != null ? s.weight : null, reps: s.reps || "", ...(s.warmup ? { warmup: true } : {}),
    }));
  }
  if (e.note && e.note.trim()) base.note = e.note.trim();
  return base;
}
export function cleanSession(current, entries) {
  return {
    date: current.date,
    name: current.name,
    entries: (entries || []).map(cleanEntry).filter((e) => e.sets.length > 0),
    effort: validEffort(current.effort),
  };
}
