import { useState, useEffect, useMemo } from "react";
import { fetchProfiles, fetchWorkouts } from "../db.js";
import { useCached } from "../lib/crewCache.js";
import { fmtDate, todayStr } from "../lib/helpers.js";

// ============ CALENDAR ============
export function CalendarView({ myId, myName, myWorkouts }) {
  const [viewId, setViewId] = useState(myId);
  const [viewName, setViewName] = useState(myName);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [sel, setSel] = useState(null); // selected day string

  // Crew list and other people's workouts come from the crew cache (instant on a revisit).
  const crew = useCached("profiles", fetchProfiles);
  const profiles = crew.data || (crew.error ? [] : null);
  const other = useCached(viewId !== myId ? "workouts:" + viewId : null, () => fetchWorkouts(viewId));
  const data = viewId === myId ? myWorkouts : other.data || [];
  const loading = viewId !== myId && !other.data && !other.error;

  const switchTo = (p) => { setViewId(p.id); setViewName(p.display_name); setSel(null); };

  // Map date-string -> list of workout names that day
  const byDay = useMemo(() => {
    const m = {};
    (data || []).forEach((w) => { (m[w.date] = m[w.date] || []).push(w.name); });
    return m;
  }, [data]);

  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayS = todayStr();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ d, ds, names: byDay[ds] || [] });
  }

  const move = (delta) => setCursor((c) => {
    let m = c.m + delta, y = c.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { y, m };
  });

  const monthCount = Object.entries(byDay).filter(([ds]) => ds.startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`)).length;

  return (
    <div className="wt-pane">
      {profiles && profiles.length > 1 && (
        <div className="wt-cal-people">
          {profiles.map((p) => (
            <button key={p.id} className={"wt-chip sm" + (viewId === p.id ? " on" : "")} onClick={() => switchTo(p)}>
              {p.id === myId ? "You" : p.display_name}
            </button>
          ))}
        </div>
      )}

      <div className="wt-cal-head">
        <button className="wt-cal-nav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <div className="wt-cal-title">{monthName}</div>
        <button className="wt-cal-nav" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="wt-cal-sub">{loading ? "Loading…" : `${viewId === myId ? "You" : viewName} · ${monthCount} session${monthCount === 1 ? "" : "s"} this month`}</div>

      <div className="wt-cal-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="wt-cal-dow">{d}</div>)}
        {cells.map((c, i) => c === null ? <div key={i} className="wt-cal-cell empty" /> : (
          <button key={i} className={"wt-cal-cell" + (c.names.length ? " has" : "") + (c.ds === todayS ? " today" : "") + (sel === c.ds ? " sel" : "")}
            onClick={() => setSel(sel === c.ds ? null : c.ds)} disabled={!c.names.length && c.ds !== todayS}>
            <span className="wt-cal-num">{c.d}</span>
            {c.names.length > 0 && <span className="wt-cal-dot" />}
          </button>
        ))}
      </div>

      {sel && (
        <div className="wt-cal-detail">
          <div className="wt-cal-detail-date">{fmtDate(sel)}</div>
          {byDay[sel] && byDay[sel].length ? (
            <div className="wt-cal-detail-list">
              {byDay[sel].map((n, i) => <span key={i} className="wt-cal-tag">{n}</span>)}
            </div>
          ) : <div className="wt-hint">No workout logged this day.</div>}
        </div>
      )}

      <div className="wt-cal-legend"><span className="wt-cal-dot" /> workout day · tap a day for details</div>
    </div>
  );
}
