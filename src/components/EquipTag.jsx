import { equipKind, equipLabel } from "../lib/equipment.js";

export function EquipTag({ meta }) {
  const k = equipKind(meta);
  if (!k) return null;
  return (
    <span className={"wt-etag " + k} title={k === "bodyweight" ? "No external weight needed" : "Needs: " + equipLabel(meta)}>
      {equipLabel(meta)}
    </span>
  );
}
