import { MUSCLE_META, muscleRegion } from "./constants.js";
import { equipKind } from "./equipment.js";

// ============ EXERCISE FILTERS (muscle group → specific muscle → equipment) ============
export const REGIONS = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Other"];
export const REGION_MUSCLES = REGIONS.reduce((acc, r) => {
  acc[r] = Object.keys(MUSCLE_META).filter((m) => m !== "other" && MUSCLE_META[m][0] === r);
  return acc;
}, {});
export const EMPTY_FILTER = { region: "All", muscle: null, equip: "any" };
export const matchFilter = (m, f) =>
  (f.region === "All" || muscleRegion(m.muscle) === f.region) &&
  (!f.muscle || m.muscle === f.muscle) &&
  (f.equip === "any" || equipKind(m) === f.equip);
export const filterActive = (f) => f.region !== "All" || f.muscle || f.equip !== "any";
