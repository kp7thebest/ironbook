// ============ EQUIPMENT ============
// Groups used by the filter; each exercise's tag shows its specific equipment.
export const EQUIP_KINDS = [
  ["bodyweight", "Bodyweight"], ["free", "Free weights"], ["machine", "Machine"],
  ["cable", "Cable"], ["bands", "Bands"], ["other", "Other equipment"],
];
// Returns null when unknown (e.g. an exercise only seen in your history with no DB match).
export function equipKind(meta) {
  const e = ((meta && meta.equipment) || "").toLowerCase().trim();
  const n = ((meta && meta.name) || "").toLowerCase();
  if (!e) return null;
  if (/(body only|bodyweight|body weight|^none$|no equipment)/.test(e) || (e === "other" && /bodyweight/.test(n))) return "bodyweight";
  if (/(dumbbell|barbell|kettlebell|e-z|ez bar|ez curl)/.test(e)) return "free";
  if (/(machine|smith)/.test(e)) return "machine";
  if (/(cable|rope)/.test(e)) return "cable";
  if (/band/.test(e)) return "bands";
  return "other";
}
export const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function equipLabel(meta) {
  const k = equipKind(meta);
  if (!k) return null;
  if (k === "bodyweight") return "Bodyweight";
  if (k === "other" && (meta.equipment || "").toLowerCase() === "other") return "Other equipment";
  const e = (meta.equipment || "").toLowerCase();
  if (e === "e-z curl bar") return "EZ bar";
  if (e === "kettlebells") return "Kettlebell";
  return capFirst(meta.equipment);
}
