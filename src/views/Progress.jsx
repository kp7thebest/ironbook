import { useState, useEffect, useMemo, useRef } from "react";
import { EquipTag } from "../components/EquipTag.jsx";
import { KG_PER_LB, muscleColor } from "../lib/constants.js";
import { capFirst } from "../lib/equipment.js";
import { displayToKg, fmtDate, kgToDisplay, norm, setLine } from "../lib/helpers.js";
import { bestE1, est1RM, fmtLoad, repsValue, roundTo, weightForReps } from "../lib/strength.js";
import { exerciseSeries, fmtNum, niceTicks, shortDate, toDisp } from "../lib/series.js";
import { fetchProfiles, fetchWorkouts } from "../db.js";
import { useCached } from "../lib/crewCache.js";
import { CompareChart } from "./Compare.jsx";
import { VolumeView } from "./Volume.jsx";
import { distUnit, fmtDuration, kmToDisplay, paceLine } from "../lib/session.js";

// ============ PROGRESS ============

// Two panels, one shared date axis: weight on top (line), reps below (columns).
// Deliberately NOT a single dual-y-axis plot — two scales on one plot make the
// crossing points and relative slopes an artifact of how the axes happen to be scaled.
export function ProgressChart({ points, unit, weighted, selIdx, onSelect, prIdx, exName, rLabel }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [W, setW] = useState(340);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setW(Math.max(260, w)); };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const padL = 36, padR = 42;
  const plotW = Math.max(40, W - padL - padR);
  const band = plotW / Math.max(n, 1);
  const xOf = (i) => padL + band * (i + 0.5);

  // vertical layout (the x-axis label band is inside H, so nothing gets clipped)
  const wTop = 30, wH = weighted ? 132 : 0, wBot = wTop + wH;
  const rLabelY = weighted ? wBot + 32 : 16;
  const rTop = weighted ? wBot + 44 : wTop, rH = weighted ? 78 : 140, rBot = rTop + rH;
  const H = rBot + 28;

  const wVals = points.map((p) => toDisp(p.top.weight, unit));
  const wFinite = wVals.filter((v) => v != null);
  const wMin = wFinite.length ? Math.min(...wFinite) : 0;
  const wMax = wFinite.length ? Math.max(...wFinite) : 1;
  const wSpan = Math.max(wMax - wMin, 1);
  const wt = niceTicks(wMin - wSpan * 0.08, wMax + wSpan * 0.2, 4); // headroom keeps the PR label inside the panel
  const yW = (v) => wBot - ((v - wt.lo) / (wt.hi - wt.lo)) * wH;

  const rVals = points.map((p) => p.top.rv);
  const rMax = Math.max(1, ...rVals.filter((v) => v != null));
  const rt = niceTicks(0, rMax * 1.08, 3);
  const yR = (v) => rBot - (v / rt.hi) * rH;

  // weight line, broken where a session has no load
  const segs = [];
  let cur = [];
  wVals.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([xOf(i), yW(v)]);
  });
  if (cur.length) segs.push(cur);
  const pts = (s) => s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  const linePath = segs.map((s) => "M" + pts(s)).join(" ");
  const areaPath = segs.filter((s) => s.length > 1)
    .map((s) => `M${s[0][0].toFixed(1)},${wBot} L${pts(s)} L${s[s.length - 1][0].toFixed(1)},${wBot} Z`).join(" ");
  let lastW = -1;
  wVals.forEach((v, i) => { if (v != null) lastW = i; });

  const bw = Math.max(3, Math.min(24, band * 0.58));
  const barPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  };

  // date labels: as many as fit without crowding, always including the latest
  const maxLabels = Math.max(2, Math.floor(plotW / 62));
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const xIdx = [];
  for (let i = 0; i < n; i += step) xIdx.push(i);
  if (n > 1 && xIdx[xIdx.length - 1] !== n - 1) {
    if (xIdx.length > 1 && (n - 1) - xIdx[xIdx.length - 1] < step * 0.6) xIdx.pop();
    xIdx.push(n - 1);
  }

  const pick = (e) => {
    const svg = svgRef.current;
    if (!svg || !n) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / band)));
    if (i !== selIdx) onSelect(i);
  };
  const onKey = (e) => {
    const moves = { ArrowLeft: selIdx - 1, ArrowRight: selIdx + 1, Home: 0, End: n - 1 };
    if (e.key in moves) { e.preventDefault(); onSelect(Math.max(0, Math.min(n - 1, moves[e.key]))); }
  };

  const xs = selIdx != null ? xOf(selIdx) : null;
  return (
    <div ref={wrapRef} className="wt-viz">
      <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="wt-viz-svg"
        tabIndex={0} role="group" onPointerMove={pick} onPointerDown={pick} onKeyDown={onKey}
        aria-label={`${exName} progress, ${n} session${n === 1 ? "" : "s"}. Left and right arrow keys move between sessions.`}>
        <defs>
          <linearGradient id="wtWeightWash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="wt-viz-wash-top" />
            <stop offset="100%" className="wt-viz-wash-bot" />
          </linearGradient>
        </defs>

        {/* panel titles, each keyed with its series' line mark */}
        {weighted && (<>
          <line x1="0" x2="12" y1="11" y2="11" className="wt-viz-key w" />
          <text x="18" y="15" className="wt-viz-title">Top-set weight ({unit})</text>
        </>)}
        <rect x="0" y={rLabelY - 9} width="12" height="8" rx="2" className="wt-viz-key-bar" />
        <text x="18" y={rLabelY} className="wt-viz-title">{rLabel || (weighted ? "Reps in that set" : "Reps (best set)")}</text>

        {/* gridlines + ticks */}
        {weighted && wt.ticks.map((t) => (
          <g key={"w" + t}>
            <line x1={padL} x2={W - padR + 8} y1={yW(t)} y2={yW(t)} className="wt-viz-grid" />
            <text x={padL - 6} y={yW(t) + 3.5} textAnchor="end" className="wt-viz-tick">{fmtNum(t)}</text>
          </g>
        ))}
        {rt.ticks.map((t) => (
          <g key={"r" + t}>
            <line x1={padL} x2={W - padR + 8} y1={yR(t)} y2={yR(t)} className={t === 0 ? "wt-viz-base" : "wt-viz-grid"} />
            <text x={padL - 6} y={yR(t) + 3.5} textAnchor="end" className="wt-viz-tick">{fmtNum(t)}</text>
          </g>
        ))}

        {/* linked crosshair across both panels */}
        {xs != null && <line x1={xs} x2={xs} y1={(weighted ? wTop : rTop) - 6} y2={rBot} className="wt-viz-cross" />}

        {/* weight: wash, line, dots */}
        {weighted && (<>
          {areaPath && <path d={areaPath} fill="url(#wtWeightWash)" stroke="none" />}
          {linePath && <path d={linePath} className="wt-viz-line" />}
          {wVals.map((v, i) => v == null ? null : (
            <circle key={"d" + i} cx={xOf(i)} cy={yW(v)} r={i === selIdx ? 6 : 4} className="wt-viz-dot" />
          ))}
          {lastW >= 0 && (
            <text x={xOf(lastW) + 9} y={yW(wVals[lastW]) + 4} className="wt-viz-end">{fmtNum(wVals[lastW])}</text>
          )}
          {prIdx != null && wVals[prIdx] != null && (
            <text x={xOf(prIdx)} y={yW(wVals[prIdx]) - 11} textAnchor="middle" className="wt-viz-pr">PR</text>
          )}
        </>)}

        {/* reps: columns from the zero baseline */}
        {rVals.map((v, i) => v == null ? null : (
          <path key={"b" + i} d={barPath(xOf(i) - bw / 2, yR(v), bw, rBot - yR(v))}
            className={"wt-viz-bar" + (i === selIdx ? " sel" : "")} />
        ))}

        {/* shared date axis */}
        {xIdx.map((i) => (
          <text key={"x" + i} x={xOf(i)} y={rBot + 18} textAnchor="middle" className="wt-viz-tick">{shortDate(points[i].date)}</text>
        ))}
      </svg>
    </div>
  );
}

// Delta on its own line, "since <date>" beneath — keeps narrow tiles from wrapping mid-phrase.
// Direction is carried by ▲/▼ + text, never by color alone.
export function KpiDelta({ v, suffix, vs, step = 0.1 }) {
  if (v == null) return <div className="wt-kpi-sub">{vs}</div>;
  const r = Math.round(roundTo(v, step) * 10) / 10;
  const cls = Math.abs(r) < 0.05 ? "flat" : r > 0 ? "up" : "down";
  return (
    <div className="wt-kpi-sub stack">
      <span className={"wt-kpi-delta " + cls}>{cls === "flat" ? "± 0" : `${r > 0 ? "▲" : "▼"} ${Math.abs(r)}${suffix}`}</span>
      <span>{vs}</span>
    </div>
  );
}

// ============ PR ESTIMATOR ============
export const REP_TABLE = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export function PREstimator({ unit, suggestion, exName }) {
  const [w, setW] = useState("");
  const [r, setR] = useState("");
  const sugKey = suggestion ? `${exName}|${suggestion.weight}|${suggestion.reps}|${unit}` : `${exName}|none|${unit}`;
  useEffect(() => {
    if (suggestion) {
      setW(String(kgToDisplay(suggestion.weight, unit)));
      setR(String(Math.round(repsValue(suggestion.reps) || 0) || ""));
    } else { setW(""); setR(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugKey]);

  const wKg = displayToKg(w.replace(",", "."), unit);
  const rv = parseInt(r, 10);
  const oneRM = est1RM(wKg, rv);
  const epley = oneRM && rv > 1 ? wKg * (1 + rv / 30) : oneRM;
  const brzycki = oneRM && rv > 1 && rv < 37 ? (wKg * 36) / (37 - rv) : oneRM;

  return (
    <div className="wt-settings-block wt-pre" id="pr-estimator">
      <div className="wt-settings-title">PR estimator</div>
      <p className="wt-hint wt-pre-lede">Estimate your 1-rep max from a set you’ve done — no need to actually max out.</p>
      <div className="wt-pre-inputs">
        <label>Weight ({unit})
          <input inputMode="decimal" value={w} placeholder="e.g. 50" onChange={(e) => setW(e.target.value.replace(/[^0-9.,]/g, ""))} aria-label="Weight lifted" />
        </label>
        <span className="wt-pre-x" aria-hidden="true">×</span>
        <label>Reps
          <input inputMode="numeric" value={r} placeholder="e.g. 8" onChange={(e) => setR(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Reps completed" />
        </label>
      </div>

      {oneRM ? (<>
        <div className="wt-pre-hero">
          <span className="wt-pre-hero-label">Estimated 1-rep max</span>
          <span className="wt-pre-hero-val">{fmtLoad(oneRM, unit)}<em> {unit}</em></span>
          {rv > 1 && <span className="wt-pre-range">Epley {fmtLoad(epley, unit)} · Brzycki {fmtLoad(brzycki, unit)}</span>}
        </div>
        {rv > 10 && <div className="wt-pre-warn">⚠ Estimates get less reliable above ~10 reps. A heavier set of 3–8 reps gives a better prediction.</div>}
        <table className="wt-pre-table">
          <caption>What you should be able to lift for other rep counts</caption>
          <thead><tr><th scope="col">Reps</th><th scope="col">Weight</th><th scope="col">% of 1RM</th></tr></thead>
          <tbody>
            {REP_TABLE.map((k) => {
              const wk = weightForReps(oneRM, k);
              return (
                <tr key={k} className={k === rv ? "on" : ""}>
                  <td>{k}</td><td>{fmtLoad(wk, unit)} {unit}</td><td>{Math.round((wk / oneRM) * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>) : (
        <div className="wt-hint">Enter a weight and the reps you managed to see your estimate.</div>
      )}

      {suggestion && (
        <div className="wt-hint wt-pre-src">
          Pre-filled with your strongest {exName} set: {kgToDisplay(suggestion.weight, unit)} {unit} × {suggestion.reps} on {shortDate(suggestion.date)}.
        </div>
      )}
      <details className="wt-pre-how">
        <summary>How is this calculated?</summary>
        <p>It averages two standard formulas — Epley, weight × (1 + reps ÷ 30), and Brzycki, weight × 36 ÷ (37 − reps).
          They agree closely between 1 and 10 reps. Treat the result as a guide, not a guarantee, and test real maxes with a spotter.</p>
      </details>
    </div>
  );
}

export const RANGES = [["all", "All"], ["90", "3M"], ["30", "1M"]];
export function ProgressView({ workouts, unit, registry, exKey, setExKey, myId }) {
  // All hooks first — this component has early returns below.
  const [range, setRange] = useState("all");
  const [sel, setSel] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [mode, setMode] = useState("exercise"); // exercise | volume (v13)
  const [cmpId, setCmpId] = useState(""); // crew member to compare with (v13)
  const crew = useCached("profiles", fetchProfiles);
  const theirs = useCached(cmpId ? "workouts:" + cmpId : null, () => fetchWorkouts(cmpId));

  const exercises = useMemo(() => {
    const m = new Map();
    for (const w of workouts) {
      for (const e of w.entries || []) {
        if (!(e.sets || []).some((s) => s.weight != null || s.reps || s.time > 0)) continue;
        const k = norm(e.exercise);
        const cur = m.get(k) || { key: k, name: e.exercise, count: 0, last: "" };
        cur.count += 1;
        if (w.date >= cur.last) { cur.last = w.date; cur.name = e.exercise; }
        m.set(k, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  }, [workouts]);

  const activeKey = exKey && exercises.some((x) => x.key === exKey) ? exKey : (exercises[0] ? exercises[0].key : null);
  const allPoints = useMemo(() => (activeKey ? exerciseSeries(workouts, activeKey) : []), [workouts, activeKey]);
  const points = useMemo(() => {
    if (range === "all") return allPoints;
    const cutoff = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    return allPoints.filter((p) => p.date >= cutoff);
  }, [allPoints, range]);
  useEffect(() => { setSel(null); }, [activeKey, range]);
  const cutoff = range === "all" ? "" : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
  const theirPoints = useMemo(
    () => (theirs.data && activeKey ? exerciseSeries(theirs.data, activeKey).filter((p) => p.date >= cutoff) : []),
    [theirs.data, activeKey, cutoff]);
  const others = (crew.data || []).filter((p) => p.id !== myId);

  const modeSwitch = (
    <div className="wt-seg wt-prog-mode" role="tablist" aria-label="Progress view">
      {[["exercise", "By exercise"], ["volume", "Weekly volume"]].map(([id, label]) => (
        <button key={id} role="tab" aria-selected={mode === id} className={"wt-seg-btn" + (mode === id ? " on" : "")} onClick={() => setMode(id)}>{label}</button>
      ))}
    </div>
  );
  if (mode === "volume") return <div className="wt-pane">{modeSwitch}<VolumeView workouts={workouts} /></div>;

  if (!exercises.length) {
    return (
      <div className="wt-pane">
        <div className="wt-empty">
          <div className="wt-empty-big">No progress yet</div>
          <p>Log a workout and your progress charts will appear here, one per exercise.</p>
        </div>
        <PREstimator unit={unit} suggestion={null} exName="" />
      </div>
    );
  }

  const exInfo = exercises.find((x) => x.key === activeKey);
  const exName = capFirst(exInfo ? exInfo.name : "");
  const meta = (registry && registry.get(activeKey)) || { name: exName, muscle: "other", equipment: "" };
  const n = points.length;
  const selIdx = n ? (sel == null ? n - 1 : Math.max(0, Math.min(sel, n - 1))) : null;
  const weighted = points.some((p) => p.top.weight != null);
  const cardio = points.some((p) => p.cardio) || allPoints.some((p) => p.cardio); // v14: time-based exercise

  // Personal best in view: heaviest top set (ties -> more reps, then the later one); reps for bodyweight.
  let prIdx = null;
  points.forEach((p, i) => {
    if (prIdx == null) { prIdx = i; return; }
    const b = points[prIdx];
    const better = weighted
      ? (p.top.weight ?? -1) > (b.top.weight ?? -1) || ((p.top.weight ?? -1) === (b.top.weight ?? -1) && (p.top.rv ?? 0) >= (b.top.rv ?? 0))
      : (p.top.rv ?? 0) >= (b.top.rv ?? 0);
    if (better) prIdx = i;
  });

  // strongest set on record (all time) seeds the PR estimator
  let bestSet = null;
  for (const p of allPoints) if (p.e1Set && (!bestSet || p.e1Set.e1 > bestSet.e1)) bestSet = { ...p.e1Set, date: p.date };

  const first = points[0], last = points[n - 1], best = prIdx != null ? points[prIdx] : null;
  const since = first ? `since ${shortDate(first.date)}` : "";
  const p = selIdx != null ? points[selIdx] : null;
  const rangeLabel = (RANGES.find(([k]) => k === range) || [])[1];

  return (
    <div className="wt-pane">
      {modeSwitch}
      <div className="wt-prog-filters">
        <label className="wt-prog-ex">
          <span className="wt-prog-ex-label">Exercise</span>
          <select value={activeKey || ""} onChange={(e) => setExKey(e.target.value)}>
            {exercises.map((x) => <option key={x.key} value={x.key}>{capFirst(x.name)} ({x.count})</option>)}
          </select>
        </label>
        <div className="wt-seg" role="group" aria-label="Time range">
          {RANGES.map(([k, label]) => (
            <button key={k} className={"wt-seg-btn" + (range === k ? " on" : "")} aria-pressed={range === k} onClick={() => setRange(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="wt-prog-head" style={{ "--plate": muscleColor(meta.muscle) }}>
        <span className="wt-plate" aria-hidden="true" />
        <div className="wt-prog-name">{exName}</div>
        <EquipTag meta={meta} />
      </div>

      {n === 0 ? (
        <div className="wt-empty small">
          <p>No {exName} sessions in the last {rangeLabel === "3M" ? "3 months" : "month"}.</p>
          <button className="wt-ghost" onClick={() => setRange("all")}>Show all time</button>
        </div>
      ) : (<>
        <div className="wt-kpis">
          {cardio ? (<>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Latest</div>
              <div className="wt-kpi-val">{fmtDuration(last.time)}</div>
              {n > 1 ? <KpiDelta v={(last.time - first.time) / 60} suffix=" min" vs={since} /> : <div className="wt-kpi-sub">first session</div>}
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Longest</div>
              <div className="wt-kpi-val">{fmtDuration(best.time)}</div>
              <div className="wt-kpi-sub">{shortDate(best.date)}</div>
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Distance</div>
              <div className="wt-kpi-val">{last.distance ? kmToDisplay(last.distance, unit) : "–"}<small> {distUnit(unit)}</small></div>
              <div className="wt-kpi-sub">{last.distance ? paceLine(last, unit) : "latest session"}</div>
            </div>
          </>) : weighted ? (<>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Latest</div>
              <div className="wt-kpi-val">{fmtNum(toDisp(last.top.weight, unit))}<small> {unit}</small><span className="wt-kpi-x"> × {last.top.reps || "–"}</span></div>
              {n > 1 ? <KpiDelta v={(toDisp(last.top.weight, unit) ?? 0) - (toDisp(first.top.weight, unit) ?? 0)} suffix={` ${unit}`} vs={since} /> : <div className="wt-kpi-sub">first session</div>}
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Heaviest</div>
              <div className="wt-kpi-val">{fmtNum(toDisp(best.top.weight, unit))}<small> {unit}</small><span className="wt-kpi-x"> × {best.top.reps || "–"}</span></div>
              <div className="wt-kpi-sub">{shortDate(best.date)}</div>
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Est. 1RM</div>
              <div className="wt-kpi-val">{last.e1 != null ? fmtLoad(last.e1, unit) : "–"}<small> {unit}</small></div>
              {n > 1 && last.e1 != null && first.e1 != null
                ? <KpiDelta v={toDisp(last.e1, unit) - toDisp(first.e1, unit)} suffix={` ${unit}`} vs={since} step={unit === "lbs" ? 1 : 0.5} />
                : <div className="wt-kpi-sub">latest session</div>}
            </div>
          </>) : (<>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Latest</div>
              <div className="wt-kpi-val">{last.top.reps || "–"}<small> reps</small></div>
              {n > 1 ? <KpiDelta v={(last.top.rv ?? 0) - (first.top.rv ?? 0)} suffix=" reps" vs={since} /> : <div className="wt-kpi-sub">first session</div>}
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Most reps</div>
              <div className="wt-kpi-val">{best.top.reps || "–"}<small> reps</small></div>
              <div className="wt-kpi-sub">{shortDate(best.date)}</div>
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Sessions</div>
              <div className="wt-kpi-val">{n}</div>
              <div className="wt-kpi-sub">{since}</div>
            </div>
          </>)}
        </div>

        <div className="wt-chart-card">
          <ProgressChart points={points} unit={unit} weighted={weighted} selIdx={selIdx} onSelect={setSel} prIdx={prIdx} exName={exName}
            rLabel={cardio ? "Minutes (work time)" : undefined} />
          {n === 1 && <div className="wt-hint wt-chart-note">Log {exName} again to start seeing a trend.</div>}

          {p && (
            <div className="wt-readout" aria-live="polite">
              <div className="wt-readout-head">
                <span className="wt-readout-date">{fmtDate(p.date)}</span>
                <span className="wt-readout-name">{p.name}</span>
                {selIdx === prIdx && n > 1 && <span className="wt-pr-chip">{cardio ? "Longest" : "PR"}</span>}
                {p.effort ? <span className="wt-effort-chip" title="Effort">Effort {p.effort}/10</span> : null}
              </div>
              {cardio ? (
              <div className="wt-readout-vals">
                <div className="wt-readout-val"><span className="wt-key r" aria-hidden="true" /><strong>{fmtDuration(p.time)}</strong><span>work time</span></div>
                {p.distance ? <div className="wt-readout-val"><strong>{kmToDisplay(p.distance, unit)}</strong><em>{distUnit(unit)}</em><span>{paceLine(p, unit)}</span></div> : null}
              </div>
              ) : (
              <div className="wt-readout-vals">
                {weighted && (
                  <div className="wt-readout-val"><span className="wt-key w" aria-hidden="true" />
                    <strong>{p.top.weight != null ? fmtNum(toDisp(p.top.weight, unit)) : "–"}</strong><em>{unit}</em><span>top set</span></div>
                )}
                <div className="wt-readout-val"><span className="wt-key r" aria-hidden="true" />
                  <strong>{p.top.reps || "–"}</strong><span>reps</span></div>
                {p.e1 != null && (
                  <div className="wt-readout-val"><strong>{fmtLoad(p.e1, unit)}</strong><em>{unit}</em><span>est. 1RM</span></div>
                )}
              </div>
              )}
              <div className="wt-readout-sets">All sets: {p.sets.map((s) => setLine(s, unit)).join("  ·  ")}</div>
            </div>
          )}

          <div className="wt-chart-foot">
            <span className="wt-hint">Tap or drag across the chart to inspect a session.</span>
            <button className="wt-ghost small" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
              {showTable ? "Hide data table" : "Show data table"}
            </button>
          </div>
          {showTable && (
            <div className="wt-ptable-wrap">
              <table className="wt-ptable">
                <thead><tr><th scope="col">Date</th><th scope="col">{cardio ? "Work time" : "Top set"}</th>{weighted && <th scope="col">Est. 1RM</th>}{cardio && <th scope="col">Distance</th>}<th scope="col">All sets</th></tr></thead>
                <tbody>
                  {points.map((pt, i) => ({ pt, i })).reverse().map(({ pt, i }) => (
                    <tr key={pt.date} className={i === selIdx ? "on" : ""} onClick={() => setSel(i)}>
                      <td>{shortDate(pt.date)}</td>
                      <td>{cardio ? fmtDuration(pt.time) : setLine(pt.top, unit)}</td>
                      {weighted && <td>{pt.e1 != null ? fmtLoad(pt.e1, unit) : "–"}</td>}
                      {cardio && <td>{pt.distance ? `${kmToDisplay(pt.distance, unit)} ${distUnit(unit)}` : "–"}</td>}
                      <td>{pt.sets.map((s) => setLine(s, unit)).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {n > 0 && others.length > 0 && (
        <div className="wt-chart-card wt-compare">
          <label className="wt-compare-pick">
            <span className="wt-prog-ex-label">Compare with</span>
            <select value={cmpId} onChange={(e) => setCmpId(e.target.value)}>
              <option value="">No one</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </label>
          {cmpId && (theirs.error ? <p className="wt-hint">Couldn’t load their log.</p>
            : !theirs.data ? <p className="wt-hint">Loading…</p>
            : theirPoints.length === 0
              ? <p className="wt-hint">{(others.find((p) => p.id === cmpId) || {}).display_name} hasn’t logged {exName}{range === "all" ? "" : " in this period"}. Exercises are matched by name.</p>
              : <CompareChart mine={points} theirs={theirPoints} theirName={(others.find((p) => p.id === cmpId) || {}).display_name || "Them"}
                  weighted={weighted} measure={weighted ? "e1" : cardio ? "time" : "reps"} unit={unit} exName={exName} />)}
        </div>
      )}

      {!cardio && <PREstimator unit={unit} suggestion={weighted ? bestSet : null} exName={exName} />}
    </div>
  );
}
