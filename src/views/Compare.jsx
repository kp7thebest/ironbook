import { useEffect, useRef, useState } from "react";
import { fmtNum, niceTicks, shortDate, toDisp } from "../lib/series.js";
import { setLine } from "../lib/helpers.js";

// ============ COMPARE WITH A CREW MEMBER (v13, N9) ============
// One measure on one axis, two people: estimated 1RM (or best reps for bodyweight exercises) over
// time. A separate chart from the main one because that chart spaces sessions evenly by index;
// here the x-axis is real dates so two people's sessions line up. Colours: you = --viz-w (violet),
// them = --viz-c (orange) — validated as a pair in both themes (CVD ΔE 27 light / 25 dark).
const DAY = 86400000;
const ms = (d) => Date.parse(d + "T00:00:00Z");

export function CompareChart({ mine, theirs, theirName, weighted, unit, exName, measure = weighted ? "e1" : "reps" }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [W, setW] = useState(340);
  const [sel, setSel] = useState(null); // index into `all`
  const [showTable, setShowTable] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setW(Math.max(260, w)); };
    update();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const val = (p) => (weighted ? (p.e1 != null ? toDisp(p.e1, unit) : null) : p.top.rv);
  const series = [
    { key: "me", label: "You", cls: "me", pts: mine.filter((p) => val(p) != null) },
    { key: "them", label: theirName, cls: "them", pts: theirs.filter((p) => val(p) != null) },
  ];
  const all = series.flatMap((s) => s.pts.map((p) => ({ s, p, t: ms(p.date), v: val(p) }))).sort((a, b) => a.t - b.t || (a.s.key === "me" ? -1 : 1));
  useEffect(() => { setSel(null); }, [mine, theirs]);

  const padL = 38, padR = 44, top = 14, plotH = 150, H = top + plotH + 30;
  const plotW = Math.max(60, W - padL - padR);
  let t0 = Math.min(...all.map((a) => a.t)), t1 = Math.max(...all.map((a) => a.t));
  if (!(t1 > t0)) { t0 -= 3 * DAY; t1 += 3 * DAY; }
  const xOf = (t) => padL + ((t - t0) / (t1 - t0)) * plotW;
  const vs = all.map((a) => a.v);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = Math.max(hi - lo, 1);
  const yt = niceTicks(lo - span * 0.12, hi + span * 0.12, 4);
  const yOf = (v) => top + plotH - ((v - yt.lo) / (yt.hi - yt.lo)) * plotH;

  // x labels: month starts when the range is long, else start / middle / end
  const xl = [];
  if (t1 - t0 > 50 * DAY) {
    const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    for (; d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1)) xl.push(d.getTime());
  } else xl.push(t0, (t0 + t1) / 2, t1);
  const step = Math.max(1, Math.ceil(xl.length / Math.max(2, Math.floor(plotW / 56))));
  const xTicks = xl.filter((_, i) => i % step === 0);

  const loadStep = unit === "lbs" ? 1 : 0.5; // round to a loadable increment
  const fmtShort = (v) => (weighted ? String(Math.round(v / loadStep) * loadStep) : fmtNum(v));
  // end labels; nudge apart when the two lines finish close together
  const ends = series.filter((s) => s.pts.length).map((s) => { const p = s.pts[s.pts.length - 1]; return { s, x: xOf(ms(p.date)), y: yOf(val(p)), v: val(p) }; });
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) {
    const [a, b] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
    const mid = (a.y + b.y) / 2; a.ly = mid - 8; b.ly = mid + 8;
  }

  const pick = (e) => {
    const svg = svgRef.current;
    if (!svg || !all.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best = 0, bd = Infinity;
    all.forEach((a, i) => { const d = Math.abs(xOf(a.t) - px) * 3 + Math.abs(yOf(a.v) - py); if (d < bd) { bd = d; best = i; } });
    if (best !== sel) setSel(best);
  };
  const onKey = (e) => {
    const cur = sel == null ? all.length - 1 : sel;
    const moves = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: all.length - 1 };
    if (e.key in moves) { e.preventDefault(); setSel(Math.max(0, Math.min(all.length - 1, moves[e.key]))); }
  };
  const fmtV = (v) => (weighted ? `${fmtShort(v)} ${unit}` : measure === "time" ? `${fmtNum(v)} min` : `${fmtNum(v)} reps`);
  const latest = (s) => (s.pts.length ? s.pts[s.pts.length - 1] : null);
  const cur = sel != null ? all[sel] : null;
  const metric = weighted ? "Est. 1-rep max" : measure === "time" ? "Work time (min)" : "Best reps";

  return (
    <div className="wt-cmp">
      <div className="wt-cmp-legend">
        <span className="wt-cmp-title">{metric}{weighted ? ` (${unit})` : ""}</span>
        {series.map((s) => (
          <span key={s.key} className="wt-cmp-key"><span className={`wt-cmp-swatch ${s.cls}`} aria-hidden="true" />{s.label}</span>
        ))}
      </div>
      <div ref={wrapRef} className="wt-viz">
        <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="wt-viz-svg" tabIndex={0} role="group"
          onPointerMove={pick} onPointerDown={pick} onKeyDown={onKey}
          aria-label={`${metric} for ${exName}: you and ${theirName}. Arrow keys move between sessions.`}>
          {yt.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR + 8} y1={yOf(t)} y2={yOf(t)} className="wt-viz-grid" />
              <text x={padL - 6} y={yOf(t) + 3.5} textAnchor="end" className="wt-viz-tick">{fmtNum(t)}</text>
            </g>
          ))}
          {cur && <line x1={xOf(cur.t)} x2={xOf(cur.t)} y1={top - 4} y2={top + plotH} className="wt-viz-cross" />}
          {series.map((s) => s.pts.length > 1 && (
            <path key={s.key} className={`wt-cmp-line ${s.cls}`}
              d={"M" + s.pts.map((p) => `${xOf(ms(p.date)).toFixed(1)},${yOf(val(p)).toFixed(1)}`).join(" L")} />
          ))}
          {all.map((a, i) => (
            <circle key={i} cx={xOf(a.t)} cy={yOf(a.v)} r={i === sel ? 6 : 4} className={`wt-cmp-dot ${a.s.cls}`} />
          ))}
          {ends.map((e) => (
            <text key={e.s.key} x={e.x + 9} y={(e.ly ?? e.y) + 4} className="wt-viz-end">{fmtShort(e.v)}</text>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={xOf(t)} y={top + plotH + 20} textAnchor="middle" className="wt-viz-tick">{shortDate(new Date(t).toISOString().slice(0, 10))}</text>
          ))}
        </svg>
      </div>
      <div className="wt-cmp-readout" aria-live="polite">
        {cur ? (
          <span><span className={`wt-cmp-swatch ${cur.s.cls}`} aria-hidden="true" /><strong>{cur.s.label}</strong> · {shortDate(cur.p.date)} · <strong>{fmtV(cur.v)}</strong>
            <span className="wt-hint">{measure === "time" ? (cur.p.distance ? ` · ${setLine({ time: cur.p.time, distance: cur.p.distance }, unit)}` : "") : ` · ${weighted ? "best set " + setLine(cur.p.e1Set || cur.p.top, unit) : "top set " + setLine(cur.p.top, unit)}`}</span></span>
        ) : (
          <span className="wt-hint">Latest — {series.map((s) => { const p = latest(s); return p ? `${s.label}: ${fmtV(val(p))} (${shortDate(p.date)})` : `${s.label}: —`; }).join(" · ")}</span>
        )}
      </div>
      <div className="wt-chart-foot">
        <span className="wt-hint">{weighted ? "1RM is estimated from each session’s best set, so different rep ranges compare fairly." : measure === "time" ? "Cardio: total work time per session." : "Bodyweight exercise: best reps per session."}</span>
        <button className="wt-ghost small" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>{showTable ? "Hide table" : "Show table"}</button>
      </div>
      {showTable && (
        <div className="wt-ptable-wrap">
          <table className="wt-ptable wt-cmp-table">
            <thead><tr><th scope="col">Date</th><th scope="col">You</th><th scope="col">{theirName}</th></tr></thead>
            <tbody>
              {[...all].reverse().map((a, i) => (
                <tr key={i}><td>{shortDate(a.p.date)}</td><td>{a.s.key === "me" ? fmtV(a.v) : ""}</td><td>{a.s.key === "them" ? fmtV(a.v) : ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
