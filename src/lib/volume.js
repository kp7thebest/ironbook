import { muscleRegion } from "./constants.js";
import { workSets } from "./strength.js";

// ============ WEEKLY VOLUME (v13, N8) ============
// Work sets (warm-ups excluded, a set needs reps or a weight) per muscle group per week.
// Weeks start on Monday. Dates are plain "YYYY-MM-DD" strings handled in UTC so a phone's
// time zone can't shift a workout into the wrong week.

export const VOLUME_REGIONS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Other"];
export const VOLUME_BINS = [[1, 5], [6, 10], [11, 15], [16, 20], [21, Infinity]]; // colour steps 1..5

const DAY = 86400000;
const toMs = (d) => Date.parse(d + "T00:00:00Z");
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);
export const weekStart = (d) => {
  const ms = toMs(d);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return toISO(ms - dow * DAY);
};
export const binOf = (n) => (n <= 0 ? 0 : VOLUME_BINS.findIndex(([lo, hi]) => n >= lo && n <= hi) + 1);

// -> { weeks: ["2026-08-24", …, this week], rows: [{ region, counts: [n…], detail: [{exercise: sets}…] }], totals: [n…],
//      cardio: [seconds per week…] }   (cardio is time, so it's kept out of the set counts)
export function weeklySets(workouts, { weeks = 8, today }) {
  const last = weekStart(today);
  const wk = [];
  for (let i = weeks - 1; i >= 0; i--) wk.push(toISO(toMs(last) - i * 7 * DAY));
  const col = new Map(wk.map((w, i) => [w, i]));
  const grid = new Map(VOLUME_REGIONS.map((r) => [r, { region: r, counts: wk.map(() => 0), detail: wk.map(() => ({})) }]));
  const cardio = wk.map(() => 0);
  for (const w of workouts) {
    const c = col.get(weekStart(w.date));
    if (c === undefined) continue;
    for (const e of w.entries || []) {
      if (e.kind === "cardio") { cardio[c] += workSets(e.sets).reduce((t, s) => t + (s.time > 0 ? s.time : 0), 0); continue; }
      const n = workSets(e.sets).filter((s) => s.weight != null || (s.reps && String(s.reps).trim())).length;
      if (!n) continue;
      const row = grid.get(muscleRegion(e.muscle)) || grid.get("Other");
      row.counts[c] += n;
      row.detail[c][e.exercise] = (row.detail[c][e.exercise] || 0) + n;
    }
  }
  const rows = [...grid.values()].filter((r) => r.region !== "Other" || r.counts.some((n) => n > 0));
  const totals = wk.map((_, i) => rows.reduce((t, r) => t + r.counts[i], 0));
  return { weeks: wk, rows, totals, cardio };
}
