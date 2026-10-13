import { EQUIP_KINDS, capFirst } from "../lib/equipment.js";
import { REGIONS, REGION_MUSCLES } from "../lib/filters.js";

export function ExerciseFilters({ f, setF, small }) {
  const subs = f.region !== "All" ? REGION_MUSCLES[f.region] || [] : [];
  const chip = "wt-chip" + (small ? " sm" : "");
  return (
    <div className="wt-filters">
      <div className="wt-regions" role="group" aria-label="Muscle group">
        {REGIONS.map((r) => (
          <button key={r} className={chip + (f.region === r ? " on" : "")} aria-pressed={f.region === r}
            onClick={() => setF({ ...f, region: r, muscle: null })}>{r}</button>
        ))}
      </div>
      {subs.length > 1 && (
        <div className="wt-subchips" role="group" aria-label={`${f.region} muscles`}>
          <button className={"wt-subchip" + (!f.muscle ? " on" : "")} aria-pressed={!f.muscle}
            onClick={() => setF({ ...f, muscle: null })}>All {f.region.toLowerCase()}</button>
          {subs.map((m) => (
            <button key={m} className={"wt-subchip" + (f.muscle === m ? " on" : "")} aria-pressed={f.muscle === m}
              onClick={() => setF({ ...f, muscle: m })}>{capFirst(m)}</button>
          ))}
        </div>
      )}
      <label className="wt-equip-select">
        <span>Equipment</span>
        <select value={f.equip} onChange={(e) => setF({ ...f, equip: e.target.value })}>
          <option value="any">Any</option>
          {EQUIP_KINDS.map(([k, label]) => <option key={k} value={k}>{k === "bodyweight" ? "Bodyweight (no weights)" : label}</option>)}
        </select>
      </label>
    </div>
  );
}
