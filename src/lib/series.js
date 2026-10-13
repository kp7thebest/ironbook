import { KG_PER_LB } from "./constants.js";
import { norm } from "./helpers.js";
import { bestE1, repsValue } from "./strength.js";

// ============ PROGRESS SERIES (pure; unit-tested) ============
// One point per session date for an exercise. "Top set" = the heaviest set that day (ties -> more reps);
// bodyweight exercises (no load logged) use the set with the most reps instead.
export function exerciseSeries(workouts, key) {
  const byDate = new Map();
  for (const w of workouts) {
    for (const e of w.entries || []) {
      if (norm(e.exercise) !== key) continue;
      if (e.kind === "cardio") {
        // v14 cardio: one point per day = total work time (warm-ups excluded); "rv" carries minutes for the column panel.
        const done = (e.sets || []).filter((x) => x.time > 0);
        const work = done.filter((x) => !x.warmup);
        if (!work.length) continue;
        const time = work.reduce((t, x) => t + x.time, 0);
        const distance = work.reduce((t, x) => t + (x.distance || 0), 0) || null;
        const pt = { date: w.date, name: w.name, effort: w.effort ?? null, cardio: true, sets: done, time, distance,
          top: { weight: null, reps: "", rv: Math.round((time / 60) * 10) / 10 }, e1: null, e1Set: null };
        const prev = byDate.get(w.date);
        if (!prev || time > prev.time) byDate.set(w.date, pt);
        continue;
      }
      const sets = (e.sets || [])
        .map((s) => ({ weight: s.weight != null && s.weight !== "" ? Number(s.weight) : null, reps: s.reps || "", rv: repsValue(s.reps), warmup: Boolean(s.warmup) }))
        .filter((s) => s.weight != null || s.rv != null);
      const work = sets.filter((s) => !s.warmup); // warm-ups are listed but never the top set
      if (!work.length) continue;
      const pool = work.some((s) => s.weight != null) ? work.filter((s) => s.weight != null) : work;
      const top = pool.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.rv ?? 0) - (a.rv ?? 0))[0];
      const best = bestE1(sets);
      const pt = { date: w.date, name: w.name, effort: w.effort ?? null, sets, top, e1: best ? best.e1 : null, e1Set: best };
      const prev = byDate.get(w.date);
      const stronger = !prev || (top.weight ?? 0) > (prev.top.weight ?? 0) ||
        ((top.weight ?? 0) === (prev.top.weight ?? 0) && (top.rv ?? 0) > (prev.top.rv ?? 0));
      if (stronger) byDate.set(w.date, pt);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Clean axis ticks (1, 2, 5 x 10^n steps) covering [min, max].
export function niceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) { const pad = Math.max(1, Math.abs(min) * 0.1); min -= pad; max += pad; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const step = (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

export const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const fmtNum = (v) => (v == null ? "–" : String(Number.isInteger(v) ? v : Math.round(v * 10) / 10));
export const toDisp = (kg, unit) => (kg == null ? null : unit === "lbs" ? kg / KG_PER_LB : kg);
