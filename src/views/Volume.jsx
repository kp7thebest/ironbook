import { useMemo, useState } from "react";
import { todayStr } from "../lib/helpers.js";
import { VOLUME_BINS, binOf, weeklySets } from "../lib/volume.js";

// ============ WEEKLY VOLUME (v13, N8) ============
// A heatmap built as a real table: rows = muscle groups, columns = the last 8 weeks (Mon–Sun),
// each cell = work sets (warm-ups excluded). The number is the data; the single-hue ramp only
// reinforces it (light → dark in light mode, dark → bright in dark mode; steps --vol-1…5 in styles.css).
const WEEKS = 8;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso) => ({ m: MON.at(Number(iso.slice(5, 7)) - 1), d: Number(iso.slice(8, 10)) });
const weekLabel = (iso) => { const { m, d } = parts(iso); return `${m} ${d}`; };

export function VolumeView({ workouts }) {
  const data = useMemo(() => weeklySets(workouts, { weeks: WEEKS, today: todayStr() }), [workouts]);
  const [sel, setSel] = useState(null); // { r: rowIndex, c: colIndex }
  const any = data.totals.some((n) => n > 0) || data.cardio.some((s) => s > 0);
  const cell = sel && data.rows[sel.r] ? { row: data.rows[sel.r], c: sel.c } : null;

  return (
    <div className="wt-vol">
      <div className="wt-vol-title">Work sets per muscle group, by week</div>
      <p className="wt-hint wt-vol-sub">Weeks run Monday–Sunday. Warm-up sets aren’t counted; cardio is shown as minutes below the total.</p>
      {!any ? (
        <div className="wt-empty small"><p>No sets logged in the last {WEEKS} weeks.</p></div>
      ) : (<>
        <div className="wt-vol-wrap">
          <table className="wt-vol-table">
            <caption className="wt-sr">Work sets per muscle group for the last {WEEKS} weeks, oldest first</caption>
            <thead>
              <tr>
                <th scope="col" className="wt-vol-corner"><span className="wt-sr">Muscle group</span></th>
                {data.weeks.map((w, i) => {
                  const { m, d } = parts(w);
                  const showMonth = i === 0 || parts(data.weeks[i - 1]).m !== m;
                  return (
                    <th key={w} scope="col" className={i === WEEKS - 1 ? "now" : ""} aria-label={`Week of ${weekLabel(w)}${i === WEEKS - 1 ? " (this week)" : ""}`}>
                      <span className="wt-vol-mon">{showMonth ? m : " "}</span>
                      <span className="wt-vol-day">{d}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, r) => (
                <tr key={row.region}>
                  <th scope="row">{row.region}</th>
                  {row.counts.map((n, c) => {
                    const on = sel && sel.r === r && sel.c === c;
                    return (
                      <td key={c}>
                        <button className={`wt-vol-cell b${binOf(n)}` + (on ? " on" : "")} onClick={() => setSel(on ? null : { r, c })}
                          aria-pressed={on} aria-label={`${row.region}, week of ${weekLabel(data.weeks[c])}: ${n} work set${n === 1 ? "" : "s"}`}>
                          {n || ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {data.totals.map((n, c) => <td key={c} className="wt-vol-total">{n}</td>)}
              </tr>
              {data.cardio.some((s) => s > 0) && (
                <tr className="wt-vol-cardio">
                  <th scope="row">Cardio <span className="wt-vol-unit">min</span></th>
                  {data.cardio.map((s, c) => <td key={c} className="wt-vol-total">{s ? Math.round(s / 60) : ""}</td>)}
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="wt-vol-readout" aria-live="polite">
          {cell ? (<>
            <div className="wt-vol-readout-head">
              <strong>{cell.row.region}</strong> · week of {weekLabel(data.weeks[cell.c])} · <strong>{cell.row.counts[cell.c]}</strong> work set{cell.row.counts[cell.c] === 1 ? "" : "s"}
            </div>
            {cell.row.counts[cell.c] > 0 ? (
              <ul className="wt-vol-list">
                {Object.entries(cell.row.detail[cell.c]).sort((a, b) => b[1] - a[1]).map(([ex, k]) => (
                  <li key={ex}><span>{ex}</span><span>{k}</span></li>
                ))}
              </ul>
            ) : <p className="wt-hint">Nothing logged for this group that week.</p>}
          </>) : <span className="wt-hint">Tap a cell to see which exercises it counts.</span>}
        </div>

        <div className="wt-vol-key" aria-hidden="true">
          {VOLUME_BINS.map(([lo, hi], i) => (
            <span key={i} className="wt-vol-key-item"><span className={`wt-vol-swatch b${i + 1}`} />{hi === Infinity ? `${lo}+` : `${lo}–${hi}`}</span>
          ))}
          <span className="wt-vol-key-unit">sets</span>
        </div>
      </>)}
    </div>
  );
}
