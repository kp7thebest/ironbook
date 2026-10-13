import { KG_PER_LB } from "./constants.js";

// ============ HELPERS ============
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
export const daysAgo = (d) => {
  const diff = Math.round((new Date(todayStr()) - new Date(d)) / 86400000);
  if (diff === 0) return "today"; if (diff === 1) return "yesterday"; return `${diff}d ago`;
};
export const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const uid = () => Math.random().toString(36).slice(2, 9);

export const kgToDisplay = (kg, unit) => {
  if (kg == null || kg === "") return "";
  const v = unit === "lbs" ? kg / KG_PER_LB : kg;
  return Math.round(v * 100) / 100;
};
export const displayToKg = (val, unit) => {
  if (val === "" || val == null || isNaN(val)) return null;
  const v = parseFloat(val);
  return unit === "lbs" ? Math.round(v * KG_PER_LB * 100) / 100 : v;
};
// ---- cardio formatting (v14): time in seconds, distance stored in km ----
export const KM_PER_MI = 1.609344;
// 1530 -> "25:30", 3900 -> "1:05:00"
export function fmtDuration(sec) {
  if (sec == null || !(sec > 0)) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
export const distUnit = (unit) => (unit === "lbs" ? "mi" : "km");
export const kmToDisplay = (km, unit) => (km == null ? null : Math.round((unit === "lbs" ? km / KM_PER_MI : km) * 100) / 100);
// "25:30 · 5 km"
export const cardioLine = (s, unit) => {
  const t = fmtDuration(s.time) || "–";
  const line = s.distance != null ? `${t} · ${kmToDisplay(s.distance, unit)} ${distUnit(unit)}` : t;
  return s.warmup ? `(${line})` : line;
};

// "80×8"; a warm-up set is shown in brackets: "(40×10)". Cardio sets: "25:30 · 5 km".
export const setLine = (s, unit) => {
  if (s.time != null) return cardioLine(s, unit);
  const w = s.weight != null ? `${kgToDisplay(s.weight, unit)}` : "bw";
  const t = `${w}×${s.reps || "–"}`;
  return s.warmup ? `(${t})` : t;
};
