import { effortLabel } from "../lib/effort.js";

// "How hard was it?" 1–10 (v14). Optional: tap the chosen number again to clear it.
// The scale fills up to the chosen value, like a meter.
export function EffortPicker({ value, onChange, available }) {
  return (
    <div className="wt-effort">
      <div className="wt-effort-head">
        <span className="wt-effort-q" id="wt-effort-q">How hard was this workout?</span>
        <span className="wt-effort-val">{value ? <><strong>{value}</strong>/10 · {effortLabel(value)}</> : "Optional"}</span>
      </div>
      <div className="wt-effort-scale" role="radiogroup" aria-labelledby="wt-effort-q">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} role="radio" aria-checked={value === n} aria-label={`${n} out of 10, ${effortLabel(n)}`}
            className={"wt-effort-btn" + (value && n <= value ? " fill" : "") + (value === n ? " on" : "")}
            onClick={() => onChange(value === n ? null : n)}>{n}</button>
        ))}
      </div>
      <div className="wt-effort-ends" aria-hidden="true"><span>Easy</span><span>Max effort</span></div>
      {available === false && (
        <p className="wt-hint wt-effort-note">Effort won’t be saved until the one-time database update is done (supabase/patch_workout_effort.sql).</p>
      )}
    </div>
  );
}
