import { useState, useEffect, useMemo, useRef } from "react";
import { CustomForm } from "../components/CustomForm.jsx";
import { EquipTag } from "../components/EquipTag.jsx";
import { ExerciseAnim } from "../components/ExerciseAnim.jsx";
import { ExerciseFilters } from "../components/ExerciseFilters.jsx";
import { muscleColor } from "../lib/constants.js";
import { EQUIP_KINDS, capFirst } from "../lib/equipment.js";
import { EMPTY_FILTER, filterActive, matchFilter } from "../lib/filters.js";
import { norm } from "../lib/helpers.js";

// ============ EXERCISE PICKER ============
export function ExercisePicker({ registry, workouts, onPick, onClose, onAddCustom }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(EMPTY_FILTER);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  const recent = useMemo(() => {
    const seen = new Set(); const out = [];
    [...workouts].sort((a, b) => b.date.localeCompare(a.date)).forEach((w) => w.entries.forEach((e) => {
      const k = norm(e.exercise);
      if (!seen.has(k)) { seen.add(k); out.push(registry.get(k) || { name: e.exercise, muscle: e.muscle }); }
    }));
    return out;
  }, [workouts, registry]);

  const { mine, db, dbTotal } = useMemo(() => {
    const nq = norm(q);
    const rank = (name) => (norm(name).startsWith(nq) ? 0 : 1);
    const mine = [], db = [];
    for (const meta of registry.values()) {
      if (!matchFilter(meta, f)) continue;
      if (nq && !norm(meta.name).includes(nq)) continue;
      (meta.source === "db" ? db : mine).push(meta);
    }
    const cmp = (a, b) => (nq ? rank(a.name) - rank(b.name) : 0) || a.name.length - b.name.length || a.name.localeCompare(b.name);
    mine.sort(cmp); db.sort(cmp);
    return { mine: mine.slice(0, 25), db: db.slice(0, 60), dbTotal: db.length };
  }, [q, f, registry]);

  const showBrowse = q === "" && !filterActive(f);
  const nothing = !showBrowse && mine.length === 0 && db.length === 0;
  const filterDesc = [f.muscle ? capFirst(f.muscle) : f.region !== "All" ? f.region : null,
    f.equip !== "any" ? (EQUIP_KINDS.find(([k]) => k === f.equip) || [])[1] : null].filter(Boolean).join(", ");

  return (
    <div className="wt-modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wt-modal" role="dialog" aria-label="Add exercise">
        {!adding ? (
          <>
            <div className="wt-modal-head">
              <input ref={inputRef} className="wt-search" placeholder="Search 870+ exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="wt-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <div className="pad-v">
              <ExerciseFilters f={f} setF={setF} small />
            </div>
            <div className="wt-picker-list">
              {showBrowse ? (
                recent.length > 0 ? (<>
                  <div className="wt-picker-label">Your recent exercises</div>
                  {recent.slice(0, 14).map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                  <div className="wt-hint pad">Search above or pick a muscle group to browse the full database.</div>
                </>) : (
                  <div className="wt-hint pad">Search above or pick a muscle group to browse the database, then select an exercise from the list.</div>
                )
              ) : (<>
                {mine.length > 0 && (<>
                  <div className="wt-picker-label">Your exercises</div>
                  {mine.map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                </>)}
                {db.length > 0 && (<>
                  <div className="wt-picker-label">Exercise database · {dbTotal}</div>
                  {db.map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                  {dbTotal > db.length && <div className="wt-hint pad">Showing {db.length} of {dbTotal}. Search or narrow the filters to see the rest.</div>}
                </>)}
                {nothing && (
                  <div className="wt-nomatch">
                    <div>No match{q ? <> for “{q}”</> : ""}{filterDesc ? ` in ${filterDesc}` : ""}.</div>
                    <button className="wt-primary" onClick={() => setAdding(true)}>Create it as a custom exercise</button>
                  </div>
                )}
              </>)}
            </div>
            <button className="wt-createx" onClick={() => setAdding(true)}>✚ Create custom exercise</button>
          </>
        ) : (
          <>
            <div className="wt-modal-head">
              <div className="wt-picker-title">New custom exercise</div>
              <button className="wt-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <CustomForm initialName={q} onCancel={() => setAdding(false)}
              onSave={(c) => { onAddCustom(c); setAdding(false); onPick(c); }} />
          </>
        )}
      </div>
    </div>
  );
}

export function PickRow({ m, onPick }) {
  const [showDemo, setShowDemo] = useState(false);
  return (
    <div className="wt-pick-wrap" style={{ "--plate": muscleColor(m.muscle) }}>
      <div className="wt-pick-row-inner">
        <button className="wt-pick-row" onClick={() => onPick(m)}>
          <span className="wt-plate sm" aria-hidden="true" />
          <span className="wt-pick-text">
            <span className="wt-pick-name">{m.name}</span>
            <span className="wt-pick-meta">
              <span className="wt-pick-muscle">{m.muscle}{m.source === "custom" ? " · custom" : ""}</span>
              <EquipTag meta={m} />
            </span>
          </span>
        </button>
        {m.img && (
          <button className={"wt-pick-demo" + (showDemo ? " on" : "")} onClick={(e) => { e.stopPropagation(); setShowDemo((v) => !v); }}
            aria-label={`Preview ${m.name} demo`} title="Preview demo">▶</button>
        )}
      </div>
      {showDemo && m.img && <ExerciseAnim imgId={m.img} name={m.name} />}
    </div>
  );
}

// Stored values match the exercise database's vocabulary so tags and filters classify them the same way.
