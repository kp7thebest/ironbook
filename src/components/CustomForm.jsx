import { useState } from "react";
import { MUSCLE_META, muscleRegion } from "../lib/constants.js";

export const CUSTOM_EQUIPMENT = [
  ["", "Not specified"], ["body only", "Bodyweight (no weights)"], ["dumbbell", "Dumbbell"], ["barbell", "Barbell"],
  ["kettlebells", "Kettlebell"], ["e-z curl bar", "EZ bar"], ["machine", "Machine"], ["cable", "Cable"],
  ["bands", "Bands"], ["other", "Other"],
];
export function CustomForm({ initialName, initialMuscle, initialEquipment, saveLabel, onSave, onCancel }) {
  const [name, setName] = useState(initialName || "");
  const [muscle, setMuscle] = useState(initialMuscle || "chest");
  const [equipment, setEquipment] = useState(initialEquipment || "");
  const muscles = Object.keys(MUSCLE_META).filter((m) => m !== "other");
  // Older customs stored free text; keep it selectable so editing doesn't silently drop it.
  const equipOptions = CUSTOM_EQUIPMENT.some(([v]) => v === equipment) ? CUSTOM_EQUIPMENT : [...CUSTOM_EQUIPMENT, [equipment, equipment]];
  return (
    <div className="wt-form">
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hammer curl (rope)" /></label>
      <label>Primary muscle
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          {muscles.map((m) => <option key={m} value={m}>{m} — {muscleRegion(m)}</option>)}
        </select>
      </label>
      <label>Equipment
        <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          {equipOptions.map(([v, label]) => <option key={v || "none"} value={v}>{label}</option>)}
        </select>
      </label>
      <div className="wt-form-actions">
        <button className="wt-primary" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), muscle, equipment: equipment.trim(), source: "custom" })}>{saveLabel || "Save exercise"}</button>
        <button className="wt-ghost" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}
