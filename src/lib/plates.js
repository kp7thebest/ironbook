// ============ PLATE MATH (v12) ============
// Which plates to load on each side of the bar for a target weight, in the unit you're logging in.

export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lbs: [45, 35, 25, 10, 5, 2.5],
};
export const BARS = {
  kg: [20, 15, 10],   // men's Olympic, women's Olympic, technique/EZ
  lbs: [45, 35, 25],
};
export const defaultBar = (unit) => BARS[unit][0];

// -> { perSide: [25, 15], leftover: 0 }   leftover = weight per side that can't be made with the plates
//    { belowBar: true } when the target is lighter than the bar.
export function platesPerSide(total, bar, unit) {
  if (total == null || !isFinite(total)) return null;
  const eps = 1e-6;
  if (total < bar - eps) return { belowBar: true, perSide: [], leftover: 0 };
  let side = (total - bar) / 2;
  const perSide = [];
  for (const p of PLATES[unit]) {
    while (side + eps >= p) { perSide.push(p); side -= p; }
  }
  return { perSide, leftover: Math.round(side * 1000) / 1000 };
}

// A barbell exercise (from the DB, a custom exercise, or a logged name matched through an alias).
export const isBarbell = (meta) => /barbell/i.test((meta && meta.equipment) || "");
